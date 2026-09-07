// ═══════════════════════════════════════════════════════════════
// Product QC — TanStack server functions (transport layer)
// ═══════════════════════════════════════════════════════════════
// Thin, zod-validated wrappers around qc.server.ts. All QC state
// transitions — including the product visibility sync (approved /
// status) and seller notifications — happen ONLY through these
// server functions, never via client SDK writes (rules enforce
// that qcReviews and the product status gate are server-only).
//
// Identity: Firebase ID token (verifyIdToken). Authorization:
//   - seller actions: product ownership (verified server-side
//     against the product doc's sellerId)
//   - reviewer actions: QC-capable admin role from users/{uid}
//     (checked inside qc.server.ts — same matrix as the rules)
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const checklistKeySchema = z.enum([
  "titleClear",
  "photosReal",
  "descriptionAccurate",
  "priceSanePaisa",
  "categoryCorrect",
  "stockCounted",
  "noProhibitedItems",
]);

const checklistSchema = z.array(
  z.object({
    key: checklistKeySchema,
    passed: z.boolean(),
    note: z.string().max(500).nullable().optional(),
  }),
);

const submitSchema = z.object({
  idToken: z.string().min(10),
  productId: z.string().min(1).max(200),
});

const reviewIdSchema = z.object({
  idToken: z.string().min(10),
  reviewId: z.string().min(1).max(200),
});

const completeSchema = z.object({
  idToken: z.string().min(10),
  reviewId: z.string().min(1).max(200),
  checklist: checklistSchema,
  decision: z.enum(["changes_required", "rejected"]).optional().default("changes_required"),
  reviewerNote: z.string().max(1000).nullable().optional(),
});

const unlistSchema = z.object({
  idToken: z.string().min(10),
  reviewId: z.string().min(1).max(200),
  reason: z.string().min(3).max(500),
});

/** Read one product doc (service account) and enforce seller ownership. */
async function readOwnedProduct(projectId: string, uid: string, productId: string) {
  const { batchGetDocs, docPath } = await import("../firebase-admin.server");
  const { PRODUCTS_COLLECTION } = await import("./qc.server");
  const name = docPath(projectId, [PRODUCTS_COLLECTION, productId]);
  const doc = (await batchGetDocs(projectId, [name])).get(name);
  if (!doc?.exists) throw new Error("Product not found.");
  const d = doc.data;
  if (String(d.sellerId ?? "") !== uid) {
    throw new Error("qc/submit: you do not own this product.");
  }
  const images = Array.isArray(d.images) ? (d.images as unknown[]) : [];
  return {
    title: String(d.title ?? ""),
    photosCount: images.length,
    priceMinor: Math.round(Number(d.price ?? 0) * 100),
    categoryId: (d.categoryId as string | null) ?? null,
    stockQty: Number(d.stock ?? 0),
    description: String(d.description ?? ""),
    flagged: d.flagged === true,
  };
}

// ── Seller: submit / resubmit a product into the QC queue ──

export const sellerSubmitProductForQc = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const { submitProductForQc } = await import("./qc.server");
    const { uid } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const productSnapshot = await readOwnedProduct(projectId, uid, data.productId);
    return submitProductForQc(projectId, {
      productId: data.productId,
      sellerUid: uid,
      productSnapshot,
    });
  });

// ── Reviewer: pick a review up (PENDING_QC → IN_QC) ──

export const adminStartQcReview = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reviewIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const { startQcReview } = await import("./qc.server");
    const { uid } = await verifyIdToken(data.idToken);
    const caller = await loadQcActor(getProjectId(), uid);
    return startQcReview(getProjectId(), data.reviewId, caller);
  });

// ── Reviewer: complete the checklist (pass / changes required / reject) ──

export const adminCompleteQcReview = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => completeSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const { completeQcReview } = await import("./qc.server");
    const { uid } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const caller = await loadQcActor(projectId, uid);
    return completeQcReview(
      projectId,
      {
        reviewId: data.reviewId,
        checklist: data.checklist,
        decision: data.decision,
        reviewerNote: data.reviewerNote ?? null,
      },
      caller,
    );
  });

// ── Reviewer: publish a QC-passed product (QC_PASSED → LISTED) ──

export const adminListQcPassedProduct = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reviewIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const { listQcPassedProduct } = await import("./qc.server");
    const { uid } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const caller = await loadQcActor(projectId, uid);
    return listQcPassedProduct(projectId, data.reviewId, caller);
  });

// ── Reviewer: takedown a listed product (LISTED → UNLISTED) ──

export const adminUnlistProduct = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => unlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const { unlistProduct } = await import("./qc.server");
    const { uid } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const caller = await loadQcActor(projectId, uid);
    return unlistProduct(projectId, data.reviewId, caller, data.reason);
  });

/**
 * Resolve the caller's admin role from users/{uid} — the SAME fields the
 * Firestore rules check (role == "admin", adminRole in [...], blocked !=
 * true). No parallel permission model exists.
 */
async function loadQcActor(projectId: string, uid: string) {
  const { batchGetDocs, docPath } = await import("../firebase-admin.server");
  const name = docPath(projectId, ["users", uid]);
  const doc = (await batchGetDocs(projectId, [name])).get(name);
  if (!doc?.exists) {
    throw new Error("Authorization failed — caller is not an admin.");
  }
  const role = String(doc.data.role ?? "customer");
  const adminRole = String(doc.data.adminRole ?? "");
  const blocked = doc.data.blocked === true;
  if (role !== "admin" || blocked) {
    throw new Error("Authorization failed — caller is not an admin.");
  }
  return { uid, adminRole };
}
