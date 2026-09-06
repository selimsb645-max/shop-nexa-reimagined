/**
 * AVENTA SHOP — Seller Campaign Submissions (Prompt 05 §3)
 *
 * Sellers may, while a campaign is in SUBMITTED/REVIEW:
 *   view campaign → submit products + discount + stock (PENDING_REVIEW)
 * Admins then review → APPROVED / REJECTED.
 *
 * Sellers can NEVER activate, approve or schedule a campaign — those
 * transitions live in campaigns.server.ts and require admin roles
 * (mirrored in Firestore rules; sellers' writes are shape-locked).
 */
import {
  docPath,
  batchGetDocs,
  commitWrites,
  runFirestoreQuery,
  toFsFields,
  fromFsFields,
  newDocId,
} from "../firebase-admin.server";
import { allowsSellerSubmissions } from "./campaignStateMachine";
import {
  validateCampaignPricing,
  type DiscountRules,
} from "./pricing";
import {
  CAMPAIGNS_COLLECTION,
  appendCampaignEvent,
  queueCampaignNotification,
  getCampaign,
  type Campaign,
} from "./campaigns.server";

export const CAMPAIGN_SUBMISSIONS_COLLECTION = "campaignSubmissions";

export type SubmissionStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export interface SubmissionItem {
  productId: string;
  originalPriceMinor: number;
  discountRules: DiscountRules;
  stockQty: number;
  /** Seller's explicitly approved floor price (§6). */
  sellerApprovedPriceMinor: number;
}

export interface CampaignSubmission {
  submissionId: string;
  campaignId: string;
  campaignName: string;
  sellerUid: string;
  shopName: string;
  items: SubmissionItem[];
  note: string | null;
  status: SubmissionStatus;
  submittedAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
  reviewNote: string | null;
}

/* ── Seller: view campaigns open for submissions (§3) ─────────── */

export async function listOpenCampaignsForSellers(projectId: string): Promise<Campaign[]> {
  const rows = (await runFirestoreQuery(projectId, {
    from: [{ collectionId: CAMPAIGNS_COLLECTION }],
    where: {
      fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "SUBMITTED" } },
    },
  })) as Array<{ document?: { fields: Record<string, unknown> } }>;
  const campaigns = rows
    .filter((row) => row.document)
    .map((row) => fromFsFields(row.document!.fields as never) as unknown as Campaign)
    .filter((c) => allowsSellerSubmissions(c.status));
  return campaigns;
}

/* ── Seller: submit products + discount + stock (§3, §6) ─────── */

export interface SubmitCampaignInput {
  campaignId: string;
  sellerUid: string;
  shopName: string;
  items: SubmissionItem[];
  note: string | null;
}

export async function submitCampaignProducts(
  projectId: string,
  input: SubmitCampaignInput,
): Promise<CampaignSubmission> {
  if (input.items.length === 0) throw new Error("campaigns/submission: no items");
  const campaign = await getCampaign(projectId, input.campaignId);
  if (!campaign) throw new Error("campaigns/not-found");
  if (!allowsSellerSubmissions(campaign.status)) {
    throw new Error(
      `campaigns/submission: campaign ${campaign.name} is ${campaign.status} — submissions are closed`,
    );
  }

  // Price safety per item (§6): negative price / invalid discount impossible.
  for (const item of input.items) {
    if (!Number.isSafeInteger(item.originalPriceMinor) || item.originalPriceMinor <= 0) {
      throw new Error(`campaigns/submission: invalid originalPrice for product ${item.productId}`);
    }
    if (item.stockQty < 0) throw new Error("campaigns/submission: stockQty must be >= 0");
    const { result, price } = validateCampaignPricing(
      item.originalPriceMinor,
      item.discountRules,
      item.sellerApprovedPriceMinor,
    );
    if (!result.ok) {
      throw new Error(`campaigns/submission: product ${item.productId} — ${result.errors.join("; ")}`);
    }
    if (price && price.finalPriceMinor < item.sellerApprovedPriceMinor) {
      // computeCampaignPrice clamps to the seller floor; treat a requested
      // price below the approved floor as valid (clamped), so nothing to do.
    }
  }

  const submissionId = `sub_${newDocId()}`;
  const now = Date.now();
  const submission: CampaignSubmission = {
    submissionId,
    campaignId: input.campaignId,
    campaignName: campaign.name,
    sellerUid: input.sellerUid,
    shopName: input.shopName,
    items: input.items,
    note: input.note,
    status: "PENDING_REVIEW",
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
  };
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [CAMPAIGN_SUBMISSIONS_COLLECTION, submissionId]),
        fields: toFsFields({ ...submission } as Record<string, unknown>),
      },
    },
  ]);
  await appendCampaignEvent(projectId, input.campaignId, "updated", { uid: input.sellerUid, adminRole: null }, {
    submissionId,
    action: "seller_submission",
    items: input.items.length,
  });
  return submission;
}

/* ── Seller: list own submissions ──────────────────────────────── */

export async function listSellerSubmissions(
  projectId: string,
  sellerUid: string,
): Promise<CampaignSubmission[]> {
  const rows = (await runFirestoreQuery(projectId, {
    from: [{ collectionId: CAMPAIGN_SUBMISSIONS_COLLECTION }],
    where: {
      fieldFilter: { field: { fieldPath: "sellerUid" }, op: "EQUAL", value: { stringValue: sellerUid } },
    },
  })) as Array<{ document?: { fields: Record<string, unknown> } }>;
  return rows
    .filter((row) => row.document)
    .map((row) => fromFsFields(row.document!.fields as never) as unknown as CampaignSubmission);
}

/* ── Admin: review submissions (§3) ────────────────────────────── */

export async function reviewCampaignSubmission(
  projectId: string,
  submissionId: string,
  decision: "APPROVED" | "REJECTED",
  reviewer: { uid: string; adminRole: string | null },
  reviewNote: string | null,
): Promise<CampaignSubmission> {
  const docs = await batchGetDocs(projectId, [
    docPath(projectId, [CAMPAIGN_SUBMISSIONS_COLLECTION, submissionId]),
  ]);
  const d = docs.get(docPath(projectId, [CAMPAIGN_SUBMISSIONS_COLLECTION, submissionId]));
  if (!d?.exists) throw new Error("campaigns/submission-not-found");
  const submission = (d.data as Record<string, unknown>) as unknown as CampaignSubmission;
  if (submission.status !== "PENDING_REVIEW") {
    throw new Error(
      `campaigns/submission: already ${submission.status} — cannot re-review`,
    );
  }
  if (!reviewer.adminRole || !["super_admin", "admin", "platform_admin", "marketing_admin"].includes(reviewer.adminRole)) {
    throw new Error(
      `campaigns/permission: role ${reviewer.adminRole ?? "none"} cannot review submissions`,
    );
  }

  const now = Date.now();
  const patch = {
    status: decision,
    reviewedAt: now,
    reviewedBy: reviewer.uid,
    reviewNote,
  };
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [CAMPAIGN_SUBMISSIONS_COLLECTION, submissionId]),
        fields: toFsFields(patch),
      },
    },
  ]);
  await appendCampaignEvent(projectId, submission.campaignId, decision === "APPROVED" ? "approved" : "rejected", reviewer, {
    submissionId,
    sellerUid: submission.sellerUid,
    reviewNote,
  });
  if (decision === "APPROVED") {
    await queueCampaignNotification(projectId, submission.campaignId, "CAMPAIGN_SCHEDULED", { name: `${submission.campaignName} — your products were approved`, endAt: 0 }, "sellers");
  }
  return { ...submission, ...patch };
}
