/**
 * Product QC server (Prompt 06 §3)
 *
 * The PRODUCT layer of the AVENTA CORE diagram:
 * PRODUCT → QC → (order/finance backbone).
 *
 * A QC review is a structured checklist — not a vibe. The reviewer
 * records pass/fail per item; a product becomes QC_PASSED only when
 * the checklist says so, and LISTED only from QC_PASSED.
 *
 * Every transition:
 *   - validates against the QC machine (§2)
 *   - appends a kernel audit entry (§cross-domain trail)
 *   - emits a typed domain event (product.qc.passed / .failed /
 *     product.listed) so the rest of the platform (order engine,
 *     campaign engine, analytics) can react without tight coupling.
 *
 * Authority: QC reviewers are content/product-capable admin roles;
 * Firestore rules additionally enforce the same matrix server-side.
 */

import {
  docPath,
  toFsFields,
  batchGetDocs,
  commitWrites,
  type FsWrite,
} from "../firebase-admin.server";
import { appendAuditEntry, type EventActor } from "../kernel/audit";
import { emitDomainEvent, type DomainEventType } from "../kernel/events";
import { isValidQcTransition, allowsSellerQcActions, type QcState } from "./qcStateMachine";

export const QC_REVIEWS_COLLECTION = "qcReviews";
export const PRODUCTS_COLLECTION = "products";

/** Structured decision recorded on QC_FAILED reviews. */
export type QcDecision = "changes_required" | "rejected";

export const QC_CHECKLIST = [
  "titleClear", // title is accurate, non-misleading, brand-correct
  "photosReal", // real photos of the actual product
  "descriptionAccurate",
  "priceSanePaisa", // integer paisa, within category sanity range
  "categoryCorrect",
  "stockCounted", // declared stock matches reality
  "noProhibitedItems", // weapons/drugs/counterfeit etc. blocked
] as const;

export type QcChecklistKey = (typeof QC_CHECKLIST)[number];

export interface QcChecklistResult {
  key: QcChecklistKey;
  passed: boolean;
  note?: string | null;
}

export interface QcReview {
  reviewId: string;
  productId: string;
  sellerUid: string;
  status: QcState;
  checklist: QcChecklistResult[];
  reviewerUid: string | null;
  failReasons: string[];
  /** Distinguishes "fix and resubmit" from a hard rejection (both land in QC_FAILED). */
  decision: QcDecision | null;
  reviewerNote: string | null;
  submittedAt: number;
  reviewedAt: number | null;
  listedAt: number | null;
}

const QC_MANAGERS = ["super_admin", "admin", "platform_admin", "content_admin", "support_admin"];

export function canReviewQc(role: string | null | undefined): boolean {
  return role != null && QC_MANAGERS.includes(role);
}

// ───────────────────────────────────────────────────────────────
// Create / resubmit (seller side)
// ───────────────────────────────────────────────────────────────

export interface SubmitForQcInput {
  productId: string;
  sellerUid: string;
  /** Product snapshot for the checklist — validated structurally here. */
  productSnapshot: {
    title: string;
    photosCount: number;
    priceMinor: number;
    categoryId: string | null;
    stockQty: number;
    description: string;
    flagged?: boolean;
  };
}

export interface QcValidation {
  ok: boolean;
  errors: string[];
}

/** Structural sanity BEFORE queueing — junk never enters the queue. */
export function validateProductForQc(input: SubmitForQcInput): QcValidation {
  const errors: string[] = [];
  const p = input.productSnapshot;
  if (!input.productId) errors.push("productId is required.");
  if (!input.sellerUid) errors.push("sellerUid is required.");
  if (!p.title || p.title.trim().length < 3) errors.push("Product title is too short.");
  if (p.photosCount < 1) errors.push("At least one real photo is required.");
  if (!Number.isSafeInteger(p.priceMinor) || p.priceMinor <= 0) {
    errors.push("Price must be a positive integer paisa amount.");
  }
  if (!p.categoryId) errors.push("Category is required.");
  if (!Number.isSafeInteger(p.stockQty) || p.stockQty < 0)
    errors.push("Stock must be a non-negative integer.");
  if ((p.description ?? "").trim().length < 10) errors.push("Description is too short.");
  if (p.flagged) errors.push("Product is flagged and must be resolved first.");
  return { ok: errors.length === 0, errors };
}

/**
 * Seller submits (or resubmits after QC_FAILED) a product for QC.
 * Idempotent: the review doc id is deterministic per product —
 * one review per product, statuses move along the machine.
 */
export async function submitProductForQc(
  projectId: string,
  input: SubmitForQcInput,
): Promise<QcReview> {
  const validation = validateProductForQc(input);
  if (!validation.ok) {
    throw new Error(`qc/submit: ${validation.errors.join(" ")}`);
  }

  const reviewId = `qc_${input.productId}`;
  const reviewName = docPath(projectId, [QC_REVIEWS_COLLECTION, reviewId]);
  const existing = (await batchGetDocs(projectId, [reviewName])).get(reviewName);
  const current = existing?.exists ? (existing.data as Record<string, unknown>) : null;
  const currentStatus = (current?.["status"] as QcState) ?? "DRAFT";

  if (current && !allowsSellerQcActions(currentStatus)) {
    throw new Error(
      `qc/submit: product is ${currentStatus} — seller cannot submit from this state`,
    );
  }

  const now = Date.now();
  const review: QcReview = {
    reviewId,
    productId: input.productId,
    sellerUid: input.sellerUid,
    status: "PENDING_QC",
    checklist: [],
    reviewerUid: (current?.["reviewerUid"] as string | null) ?? null,
    failReasons: [],
    decision: null,
    reviewerNote: null,
    submittedAt: now,
    reviewedAt: null,
    listedAt: (current?.["listedAt"] as number | null) ?? null,
  };

  // Atomic commit: review doc + product visibility sync + seller notification
  // land together. The product is forced back to draft/unapproved while it
  // waits for QC — sellers can never expose it by writing status directly.
  await commitWrites(projectId, [
    {
      update: {
        name: reviewName,
        fields: toFsFields({
          ...review,
          decision: null,
          reviewerNote: null,
          productSnapshot: JSON.stringify(input.productSnapshot),
          // seller edits after a failed review must reach the reviewer:
          updatedAt: now,
        }),
      },
    },
    {
      update: {
        name: docPath(projectId, [PRODUCTS_COLLECTION, input.productId]),
        fields: toFsFields({ status: "draft", approved: false, updatedAt: now }),
      },
    },
    {
      update: {
        name: docPath(projectId, [
          "sellers",
          input.sellerUid,
          "notifications",
          `${reviewId}_SUBMITTED_${now}`,
        ]),
        fields: toFsFields({
          type: "system",
          title:
            currentStatus === "QC_FAILED"
              ? "Product resubmitted for QC"
              : "Product submitted for QC",
          message: `"${input.productSnapshot.title}" is now in the QC queue. You will be notified once a reviewer has checked it.`,
          link: `/seller/products`,
          read: false,
          createdAt: now,
        }),
      },
    },
  ]);

  await appendAuditEntry(projectId, {
    actor: { id: `seller:${input.sellerUid}`, role: "seller" },
    action: "qc.submitted",
    target: `products/${input.productId}`,
    meta: { reviewId, resubmission: currentStatus === "QC_FAILED" },
  });

  return review;
}

// ───────────────────────────────────────────────────────────────
// Reviewer side
// ───────────────────────────────────────────────────────────────

export interface QcActor {
  uid: string;
  adminRole: string | null;
}

function requireQcReviewer(actor: QcActor): void {
  if (!canReviewQc(actor.adminRole)) {
    throw new Error(`qc/permission: role ${actor.adminRole ?? "none"} cannot review QC`);
  }
}

/** Reviewer picks the next PENDING_QC review → IN_QC. */
export async function startQcReview(
  projectId: string,
  reviewId: string,
  actor: QcActor,
): Promise<QcReview> {
  requireQcReviewer(actor);
  const review = await readQcReview(projectId, reviewId);
  if (!isValidQcTransition(review.status, "IN_QC")) {
    throw new Error(`qc/start: illegal transition ${review.status} → IN_QC`);
  }
  return writeTransition(projectId, review, "IN_QC", {
    actor: { id: `admin:${actor.uid}`, role: actor.adminRole },
    reviewerUid: actor.uid,
    notify: {
      type: "system",
      title: "QC review started",
      message: `A reviewer has started checking "${review.productId}" for QC.`,
      link: "/seller/products",
    },
  });
}

export interface CompleteQcInput {
  reviewId: string;
  checklist: QcChecklistResult[];
  /** changes_required (default) lets the seller resubmit; rejected still records reasons. */
  decision?: QcDecision;
  reviewerNote?: string | null;
}

/** Complete the checklist → QC_PASSED or QC_FAILED, with reasons. */
export async function completeQcReview(
  projectId: string,
  input: CompleteQcInput,
  actor: QcActor,
): Promise<QcReview> {
  requireQcReviewer(actor);

  // checklist integrity: every key exactly once
  const keys = input.checklist.map((c) => c.key);
  if (keys.length !== QC_CHECKLIST.length || new Set(keys).size !== keys.length) {
    throw new Error("qc/complete: checklist must cover every item exactly once");
  }

  const review = await readQcReview(projectId, input.reviewId);
  if (!isValidQcTransition(review.status, "QC_PASSED")) {
    // only IN_QC may complete
    throw new Error(`qc/complete: review is ${review.status}, not IN_QC`);
  }

  const failReasons = input.checklist.filter((c) => !c.passed).map((c) => c.key);
  const target: QcState = failReasons.length === 0 ? "QC_PASSED" : "QC_FAILED";
  const decision: QcDecision = input.decision ?? "changes_required";
  if (target === "QC_FAILED" && decision === "rejected" && !(input.reviewerNote ?? "").trim()) {
    throw new Error("qc/complete: rejection requires a reviewer note explaining why");
  }
  const updated = await writeTransition(projectId, review, target, {
    actor: { id: `admin:${actor.uid}`, role: actor.adminRole },
    reviewerUid: actor.uid,
    extra: {
      checklist: input.checklist,
      failReasons,
      decision: target === "QC_FAILED" ? decision : null,
      reviewerNote: input.reviewerNote ?? null,
      reviewedAt: Date.now(),
    },
    // A failed review keeps the product invisible; passed products stay
    // invisible until an explicit LISTED decision publishes them.
    productPatch: target === "QC_FAILED" ? { approved: false, status: "draft" } : undefined,
    notify:
      target === "QC_FAILED"
        ? {
            type: decision === "rejected" ? "product_rejected" : "system",
            title:
              decision === "rejected"
                ? "Product rejected in QC"
                : "Changes required before approval",
            message:
              decision === "rejected"
                ? `"${review.productId}" was rejected. Reviewer note: ${input.reviewerNote ?? ""}`
                : `"${review.productId}" needs corrections: ${failReasons.join(", ")}. Fix the issues and resubmit.`,
            link: "/seller/products",
          }
        : {
            type: "system",
            title: "QC passed",
            message: `"${review.productId}" passed the QC checklist and is awaiting publication.`,
            link: "/seller/products",
          },
  });

  // §backbone: emit the domain event the rest of the platform listens to
  const eventType: DomainEventType =
    target === "QC_PASSED" ? "product.qc.passed" : "product.qc.failed";
  await emitDomainEvent(projectId, {
    source: "product",
    type: eventType,
    key: `${input.reviewId}_${updated.reviewedAt}`,
    seq: 1,
    actor: { id: `admin:${actor.uid}`, role: actor.adminRole },
    payload: {
      productId: review.productId,
      sellerUid: review.sellerUid,
      failReasons,
      decision: target === "QC_FAILED" ? decision : null,
      reviewId: review.reviewId,
    },
  });

  return updated;
}

/** QC_PASSED → LISTED (the storefront gate). */
export async function listQcPassedProduct(
  projectId: string,
  reviewId: string,
  actor: QcActor,
): Promise<QcReview> {
  requireQcReviewer(actor);
  const review = await readQcReview(projectId, reviewId);
  if (!isValidQcTransition(review.status, "LISTED")) {
    throw new Error(`qc/list: illegal transition ${review.status} → LISTED`);
  }
  // Publication moment: the product becomes publicly visible (approved +
  // published) ONLY through this auditable QC transition.
  const updated = await writeTransition(projectId, review, "LISTED", {
    actor: { id: `admin:${actor.uid}`, role: actor.adminRole },
    extra: { listedAt: Date.now() },
    productPatch: { approved: true, status: "published" },
    notify: {
      type: "product_approved",
      title: "Product approved and published",
      message: `"${review.productId}" passed QC and is now live on the storefront.`,
      link: "/seller/products",
    },
  });
  await emitDomainEvent(projectId, {
    source: "product",
    type: "product.listed",
    key: review.productId,
    seq: 1,
    actor: { id: `admin:${actor.uid}`, role: actor.adminRole },
    payload: { productId: review.productId, sellerUid: review.sellerUid },
  });
  return updated;
}

/** LISTED → UNLISTED (takedown). */
export async function unlistProduct(
  projectId: string,
  reviewId: string,
  actor: QcActor,
  reason: string,
): Promise<QcReview> {
  requireQcReviewer(actor);
  const review = await readQcReview(projectId, reviewId);
  if (!isValidQcTransition(review.status, "UNLISTED")) {
    throw new Error(`qc/unlist: illegal transition ${review.status} → UNLISTED`);
  }
  const updated = await writeTransition(projectId, review, "UNLISTED", {
    actor: { id: `admin:${actor.uid}`, role: actor.adminRole },
    extra: { unlistReason: reason, unlistedAt: Date.now() },
    productPatch: { approved: false, status: "draft" },
    notify: {
      type: "system",
      title: "Product unlisted",
      message: `"${review.productId}" was taken down from the storefront. Reason: ${reason}`,
      link: "/seller/products",
    },
  });
  await emitDomainEvent(projectId, {
    source: "product",
    type: "product.unlisted",
    key: `${review.productId}_${Date.now()}`,
    seq: 1,
    actor: { id: `admin:${actor.uid}`, role: actor.adminRole },
    payload: {
      productId: review.productId,
      sellerUid: review.sellerUid,
      reason,
    },
  });
  return updated;
}

// ───────────────────────────────────────────────────────────────
// Read helpers
// ───────────────────────────────────────────────────────────────

export async function readQcReview(projectId: string, reviewId: string): Promise<QcReview> {
  const name = docPath(projectId, [QC_REVIEWS_COLLECTION, reviewId]);
  const doc = (await batchGetDocs(projectId, [name])).get(name);
  if (!doc?.exists) throw new Error(`qc/read: ${reviewId} not found`);
  const d = doc.data as Record<string, unknown>;
  return {
    reviewId: String(d.reviewId ?? reviewId),
    productId: String(d.productId ?? ""),
    sellerUid: String(d.sellerUid ?? ""),
    status: (d.status as QcState) ?? "DRAFT",
    checklist: (d.checklist as QcChecklistResult[]) ?? [],
    reviewerUid: (d.reviewerUid as string | null) ?? null,
    failReasons: (d.failReasons as string[]) ?? [],
    decision: (d.decision as QcDecision | null) ?? null,
    reviewerNote: (d.reviewerNote as string | null) ?? null,
    submittedAt: Number(d.submittedAt ?? 0),
    reviewedAt: (d.reviewedAt as number | null) ?? null,
    listedAt: (d.listedAt as number | null) ?? null,
  };
}

// ───────────────────────────────────────────────────────────────
// Internal transition writer (audit + persistence together)
// ───────────────────────────────────────────────────────────────

async function writeTransition(
  projectId: string,
  review: QcReview,
  to: QcState,
  opts: {
    actor: EventActor;
    reviewerUid?: string | null;
    extra?: Record<string, unknown>;
    /**
     * Fields synced onto the product document in the SAME commit —
     * the product's public visibility (approved/status) can only
     * change together with an auditable QC transition, never directly.
     */
    productPatch?: Record<string, unknown>;
    /** Seller notification written in the SAME commit (atomic with the transition). */
    notify?: { type: string; title: string; message: string; link?: string };
  },
): Promise<QcReview> {
  const from = review.status;
  if (!isValidQcTransition(from, to)) {
    throw new Error(`qc/transition: illegal transition ${from} → ${to}`);
  }
  const now = Date.now();
  const updated: QcReview = {
    ...review,
    status: to,
    reviewerUid: opts.reviewerUid ?? review.reviewerUid,
    ...((opts.extra ?? {}) as Partial<QcReview>),
  };
  // CRITICAL FIX (Sep 6, PART 2): commitWrites sends the REST commit
  // WITHOUT updateMask — the write REPLACES the whole document. The
  // review object decoded by readQcReview does not carry the raw
  // productSnapshot string, so every reviewer transition silently
  // WIPED the seller's submitted product snapshot (the reviewer's
  // source of truth for the checklist). Carry it through untouched.
  const rawDoc = (await batchGetDocs(projectId, [
    docPath(projectId, [QC_REVIEWS_COLLECTION, review.reviewId]),
  ])).get(docPath(projectId, [QC_REVIEWS_COLLECTION, review.reviewId]));
  const rawSnapshot = rawDoc?.exists
    ? (rawDoc.data as Record<string, unknown>)["productSnapshot"] ?? null
    : null;
  const writes: FsWrite[] = [
    {
      update: {
        name: docPath(projectId, [QC_REVIEWS_COLLECTION, review.reviewId]),
        fields: toFsFields({
          ...updated,
          ...(rawSnapshot != null ? { productSnapshot: rawSnapshot } : {}),
          updatedAt: now,
        }),
      },
    },
  ];
  if (opts.productPatch) {
    writes.push({
      update: {
        name: docPath(projectId, [PRODUCTS_COLLECTION, review.productId]),
        fields: toFsFields({ ...opts.productPatch, updatedAt: now }),
      },
    });
  }
  if (opts.notify) {
    writes.push({
      update: {
        name: docPath(projectId, [
          "sellers",
          review.sellerUid,
          "notifications",
          `${review.reviewId}_${to}_${now}`,
        ]),
        fields: toFsFields({
          type: opts.notify.type,
          title: opts.notify.title,
          message: opts.notify.message,
          link: opts.notify.link ?? "/seller/products",
          read: false,
          createdAt: now,
        }),
      },
    });
  }
  await commitWrites(projectId, writes);
  await appendAuditEntry(projectId, {
    actor: opts.actor,
    action: `qc.${to.toLowerCase()}`,
    target: `products/${review.productId}`,
    meta: { reviewId: review.reviewId, from, to },
  });
  return updated;
}
