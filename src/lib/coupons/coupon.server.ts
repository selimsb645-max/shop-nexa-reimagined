/**
 * AVENTA SHOP — Coupon engine (server-authoritative management core).
 *
 * The canonical coupon admin layer — same discipline as the Flash
 * Sale scheduling core: role verification from users/{uid}, strict
 * input validation, atomic REST commits with preconditions, and the
 * shared kernel audit trail for every sensitive mutation. Client
 * writes to coupons are denied by the new rules (seller self-create
 * stays constrained); every admin mutation flows through HERE.
 *
 * Redemption itself lives in checkout.server.ts — the ONLY redemption
 * path. This module provides the redemption write builder
 * (buildCouponRedemptionWrites) so the checkout commit stays a
 * single ATOMIC batch: order + stock + coupon counter increments +
 * per-customer counter + immutable redemption record succeed or fail
 * together. Concurrent last-usage redemptions collide on the coupon
 * updateTime precondition and the whole checkout aborts — double
 * redemption is structurally impossible.
 *
 * Money convention (legacy Coupon shape, NOT integer paisa):
 *   • percent coupons: value = 1-100 (%)
 *   • fixed coupons:   value = taka (2dp)
 *   • minSubtotal / maxDiscount = taka (2dp)
 */

import {
  batchGetDocs,
  commitWrites,
  docPath,
  fromFsFields,
  runFirestoreQuery,
  type FsValue,
  toFsFields,
  type FetchedDoc,
  type FsWrite,
} from "../firebase-admin.server";
import { appendAuditEntry, type EventActor } from "../kernel/audit";
import {
  evaluateCoupon,
  round2,
  type CouponDiscountType,
  type CouponForEvaluation,
  type LineForEvaluation,
} from "./evaluate";

export const COUPONS_COLLECTION = "coupons";
export const COUPON_REDEMPTIONS_COLLECTION = "couponRedemptions";
export const COUPON_CUSTOMER_COUNTERS_COLLECTION = "couponCustomerCounters";

/** Admin roles allowed to manage coupons — the SAME set the legacy
 *  rules granted client writes to; the permission model is unchanged,
 *  only the write path moved server-side. */
export const COUPON_MANAGER_ROLES = [
  "super_admin",
  "admin",
  "platform_admin",
  "content_admin",
  "marketing_admin",
] as const;

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────

export interface CouponDoc extends CouponForEvaluation {
  createdAt: number;
  updatedAt: number;
}

export interface CreateCouponInput {
  code: string;
  type: CouponDiscountType;
  value: number;
  minSubtotal: number | null;
  startAt: number | null;
  expiresAt: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  sellerId: string | null;
  productIds: string[];
  categoryIds: string[];
  maxDiscount: number | null;
  active?: boolean;
}

export interface UpdateCouponPatch {
  type?: CouponDiscountType;
  value?: number;
  minSubtotal?: number | null;
  startAt?: number | null;
  expiresAt?: number | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  productIds?: string[];
  categoryIds?: string[];
  maxDiscount?: number | null;
  active?: boolean;
}

export interface AdminOpOpts {
  actor?: EventActor;
}

export interface CouponAdminError extends Error {
  code?: string;
}

function fail(code: string, message: string): never {
  const err = new Error(message) as CouponAdminError;
  err.code = code;
  throw err;
}

// ───────────────────────────────────────────────────────────────
// Authorization — users/{uid} role check (same fields as rules)
// ───────────────────────────────────────────────────────────────

export async function verifyCouponAdmin(
  projectId: string,
  callerUid: string,
): Promise<{ adminRole: string }> {
  const userPath = docPath(projectId, ["users", callerUid]);
  const docs = await batchGetDocs(projectId, [userPath]);
  const userDoc = docs.get(userPath);
  if (!userDoc?.exists) {
    fail("coupon/unauthorized", "Authorization failed — caller is not an admin.");
  }
  const role = String(userDoc.data["role"] ?? "customer");
  const adminRole = String(userDoc.data["adminRole"] ?? "");
  const blocked = userDoc.data["blocked"] === true;
  if (
    role !== "admin" ||
    blocked ||
    !(COUPON_MANAGER_ROLES as readonly string[]).includes(adminRole)
  ) {
    fail(
      "coupon/unauthorized",
      `Authorization failed — coupon management requires one of: ${COUPON_MANAGER_ROLES.join(", ")}.`,
    );
  }
  return { adminRole };
}

// ───────────────────────────────────────────────────────────────
// Validation (pure)
// ───────────────────────────────────────────────────────────────

const CODE_RE = /^[A-Z0-9_-]{3,24}$/;

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Validate a coupon payload fragment. Returns error string or null. */
export function validateCouponFields(c: {
  type: CouponDiscountType;
  value: number;
  minSubtotal: number | null;
  startAt: number | null;
  expiresAt: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  productIds: string[];
  categoryIds: string[];
  maxDiscount: number | null;
}): string | null {
  if (c.type !== "percent" && c.type !== "fixed") {
    return "type must be percent or fixed.";
  }
  const v = c.value;
  if (!Number.isFinite(v) || v <= 0) return "value must be positive.";
  if (c.type === "percent" && (!Number.isInteger(v) || v > 100)) {
    return "percent value must be a whole number between 1 and 100.";
  }
  if (c.type === "fixed" && round2(v) !== v) {
    return "fixed value must be a taka amount with at most 2 decimals.";
  }
  if (c.minSubtotal != null && (!Number.isFinite(c.minSubtotal) || c.minSubtotal < 0)) {
    return "minSubtotal must be zero or a positive amount.";
  }
  if (c.maxDiscount != null && (!Number.isFinite(c.maxDiscount) || c.maxDiscount <= 0)) {
    return "maxDiscount must be a positive amount.";
  }
  if (c.startAt != null && (!Number.isInteger(c.startAt) || c.startAt <= 0)) {
    return "startAt must be epoch milliseconds.";
  }
  if (c.expiresAt != null && (!Number.isInteger(c.expiresAt) || c.expiresAt <= 0)) {
    return "expiresAt must be epoch milliseconds.";
  }
  if (c.startAt != null && c.expiresAt != null && c.expiresAt <= c.startAt) {
    return "expiresAt must be after startAt.";
  }
  if (c.usageLimit != null && (!Number.isInteger(c.usageLimit) || c.usageLimit < 1)) {
    return "usageLimit must be a whole number >= 1.";
  }
  if (
    c.perCustomerLimit != null &&
    (!Number.isInteger(c.perCustomerLimit) || c.perCustomerLimit < 1)
  ) {
    return "perCustomerLimit must be a whole number >= 1.";
  }
  if (!Array.isArray(c.productIds) || c.productIds.length > 200) {
    return "productIds must be a list of at most 200 product ids.";
  }
  if (!Array.isArray(c.categoryIds) || c.categoryIds.length > 50) {
    return "categoryIds must be a list of at most 50 category ids.";
  }
  return null;
}

function cleanIdList(raw: string[] | undefined): string[] {
  if (!raw) return [];
  return Array.from(new Set(raw.map((s) => String(s).trim()).filter(Boolean)));
}

// ───────────────────────────────────────────────────────────────
// Doc codec
// ───────────────────────────────────────────────────────────────

function fromCouponDoc(code: string, data: Record<string, unknown>): CouponDoc {
  return {
    code,
    type: String(data["type"] ?? "fixed") as CouponDiscountType,
    value: Number(data["value"] ?? 0),
    minSubtotal: data["minSubtotal"] == null ? null : Number(data["minSubtotal"]),
    startAt: data["startAt"] == null ? null : Number(data["startAt"]),
    expiresAt: data["expiresAt"] == null ? null : Number(data["expiresAt"]),
    active: data["active"] === true,
    usageLimit: data["usageLimit"] == null ? null : Number(data["usageLimit"]),
    uses: Number(data["uses"] ?? 0),
    perCustomerLimit: data["perCustomerLimit"] == null ? null : Number(data["perCustomerLimit"]),
    sellerId: (data["sellerId"] as string | null) ?? null,
    productIds: Array.isArray(data["productIds"]) ? (data["productIds"] as string[]) : [],
    categoryIds: Array.isArray(data["categoryIds"]) ? (data["categoryIds"] as string[]) : [],
    maxDiscount: data["maxDiscount"] == null ? null : Number(data["maxDiscount"]),
    createdAt: Number(data["createdAt"] ?? 0),
    updatedAt: Number(data["updatedAt"] ?? 0),
  };
}

export function couponDocFields(
  doc: Omit<CouponDoc, "createdAt" | "updatedAt">,
): Record<string, unknown> {
  return {
    code: doc.code,
    type: doc.type,
    value: doc.value,
    minSubtotal: doc.minSubtotal,
    startAt: doc.startAt,
    expiresAt: doc.expiresAt,
    active: doc.active,
    usageLimit: doc.usageLimit,
    uses: doc.uses,
    perCustomerLimit: doc.perCustomerLimit,
    sellerId: doc.sellerId,
    productIds: doc.productIds,
    categoryIds: doc.categoryIds,
    maxDiscount: doc.maxDiscount,
  };
}

async function readCoupon(
  projectId: string,
  code: string,
): Promise<{ doc: CouponDoc; updateTime: string } | null> {
  const path = docPath(projectId, [COUPONS_COLLECTION, code]);
  const docs = await batchGetDocs(projectId, [path]);
  const d = docs.get(path);
  if (!d?.exists) return null;
  return { doc: fromCouponDoc(code, d.data), updateTime: d.updateTime ?? "" };
}

// ───────────────────────────────────────────────────────────────
// Management operations (audited)
// ───────────────────────────────────────────────────────────────

export async function createCoupon(
  projectId: string,
  input: CreateCouponInput,
  opts: AdminOpOpts = {},
): Promise<CouponDoc> {
  const code = normalizeCouponCode(input.code ?? "");
  if (!CODE_RE.test(code)) {
    fail(
      "coupon/validation",
      "coupon/validation: Code must be 3-24 characters (A-Z, 0-9, _ or -).",
    );
  }
  const productIds = cleanIdList(input.productIds);
  const categoryIds = cleanIdList(input.categoryIds);
  const fields = {
    type: input.type,
    value: input.value,
    sellerId: input.sellerId ?? null,
    minSubtotal: input.minSubtotal ?? null,
    startAt: input.startAt ?? null,
    expiresAt: input.expiresAt ?? null,
    usageLimit: input.usageLimit ?? null,
    perCustomerLimit: input.perCustomerLimit ?? null,
    productIds,
    categoryIds,
    maxDiscount: input.maxDiscount ?? null,
  };
  const err = validateCouponFields(fields);
  if (err) fail("coupon/validation", `coupon/validation: ${err}`);

  const now = Date.now();
  const doc: CouponDoc = {
    ...fields,
    code,
    uses: 0,
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  };

  // Uniqueness: the code IS the doc id — create-only precondition makes
  // duplicate codes structurally impossible (atomic, race-safe).
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [COUPONS_COLLECTION, code]),
        fields: toFsFields(couponDocFields(doc) as Record<string, unknown>),
      },
      currentDocument: { exists: false },
    },
  ]);

  if (opts.actor) {
    await appendAuditEntry(projectId, {
      actor: opts.actor,
      action: "COUPON_CREATED",
      target: `${COUPONS_COLLECTION}/${code}`,
      meta: {
        type: doc.type,
        value: doc.value,
        sellerId: doc.sellerId,
        startAt: doc.startAt,
        expiresAt: doc.expiresAt,
        usageLimit: doc.usageLimit,
        perCustomerLimit: doc.perCustomerLimit,
      },
    });
  }
  return doc;
}

const PATCH_KEYS = [
  "type",
  "value",
  "minSubtotal",
  "startAt",
  "expiresAt",
  "usageLimit",
  "perCustomerLimit",
  "productIds",
  "categoryIds",
  "maxDiscount",
  "active",
] as const;

export async function updateCoupon(
  projectId: string,
  rawCode: string,
  patch: UpdateCouponPatch,
  opts: AdminOpOpts = {},
): Promise<CouponDoc> {
  const code = normalizeCouponCode(rawCode);
  const existing = await readCoupon(projectId, code);
  if (!existing) fail("coupon/notfound", `coupon/notfound: ${code}`);

  const before = existing.doc;
  const next: CouponDoc = { ...before };
  const applied: string[] = [];
  for (const key of PATCH_KEYS) {
    if (patch[key] !== undefined) {
      (next as unknown as Record<string, unknown>)[key] = patch[key];
      applied.push(key);
    }
  }
  if (applied.length === 0) {
    fail("coupon/validation", "coupon/validation: empty patch.");
  }
  // ownership + identity are immutable
  // (never patchable: code, sellerId, uses, createdAt)
  next.productIds = cleanIdList(next.productIds);
  next.categoryIds = cleanIdList(next.categoryIds);

  const err = validateCouponFields({
    type: next.type,
    value: next.value,
    minSubtotal: next.minSubtotal,
    startAt: next.startAt,
    expiresAt: next.expiresAt,
    usageLimit: next.usageLimit,
    perCustomerLimit: next.perCustomerLimit,
    productIds: next.productIds,
    categoryIds: next.categoryIds,
    maxDiscount: next.maxDiscount,
  });
  if (err) fail("coupon/validation", `coupon/validation: ${err}`);

  // Counter integrity: the global limit can never be tightened below
  // the redemptions that already happened.
  if (next.usageLimit != null && next.usageLimit < next.uses) {
    fail(
      "coupon/validation",
      `coupon/validation: usageLimit (${next.usageLimit}) cannot go below existing redemptions (${next.uses}).`,
    );
  }

  next.updatedAt = Date.now();
  // Masked patch — write ONLY the changed fields (plus updatedAt).
  // Server-only fields written by other paths (e.g. the expiry
  // sweeper's autoExpiredAt) are never touched or dropped.
  const patchFields: Record<string, unknown> = { updatedAt: next.updatedAt };
  for (const key of applied) {
    patchFields[key] = (next as unknown as Record<string, unknown>)[key];
  }
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [COUPONS_COLLECTION, code]),
        fields: toFsFields(patchFields),
      },
      updateMask: { fieldPaths: Object.keys(patchFields) },
      currentDocument: { updateTime: existing.updateTime },
    },
  ]);

  if (opts.actor) {
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of applied) {
      const b = (before as unknown as Record<string, unknown>)[key];
      const a = (next as unknown as Record<string, unknown>)[key];
      if (b !== a) changes[key] = { before: b, after: a };
    }
    await appendAuditEntry(projectId, {
      actor: opts.actor,
      action: "COUPON_UPDATED",
      target: `${COUPONS_COLLECTION}/${code}`,
      meta: { changes },
    });
  }
  return next;
}

export async function setCouponActive(
  projectId: string,
  rawCode: string,
  active: boolean,
  reason: string | null,
  opts: AdminOpOpts = {},
): Promise<CouponDoc> {
  const code = normalizeCouponCode(rawCode);
  const existing = await readCoupon(projectId, code);
  if (!existing) fail("coupon/notfound", `coupon/notfound: ${code}`);

  const now = Date.now();
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [COUPONS_COLLECTION, code]),
        fields: toFsFields({ active, updatedAt: now }),
      },
      // Masked update — only these fields change; a sweeper-written
      // `autoExpiredAt` (coupon-expiry.functions.ts) survives intact.
      updateMask: { fieldPaths: ["active", "updatedAt"] },
      currentDocument: { updateTime: existing.updateTime },
    },
  ]);

  if (opts.actor) {
    await appendAuditEntry(projectId, {
      actor: opts.actor,
      action: active ? "COUPON_ENABLED" : "COUPON_DISABLED",
      target: `${COUPONS_COLLECTION}/${code}`,
      meta: { reason: reason ?? null },
    });
  }
  return { ...existing.doc, active, updatedAt: now };
}

export async function deleteCoupon(
  projectId: string,
  rawCode: string,
  opts: AdminOpOpts = {},
): Promise<void> {
  const code = normalizeCouponCode(rawCode);
  const existing = await readCoupon(projectId, code);
  if (!existing) fail("coupon/notfound", `coupon/notfound: ${code}`);

  // Financial history is immutable — a coupon that was ever redeemed
  // must be DISABLED, never hard-deleted (redemption records and
  // per-customer counters keep referencing it).
  if (existing.doc.uses > 0) {
    fail(
      "coupon/in-use",
      `coupon/in-use: ${code} has ${existing.doc.uses} redemption(s) — disable it instead of deleting.`,
    );
  }
  await commitWrites(projectId, [
    {
      delete: docPath(projectId, [COUPONS_COLLECTION, code]),
      currentDocument: { updateTime: existing.updateTime },
    },
  ]);
  if (opts.actor) {
    await appendAuditEntry(projectId, {
      actor: opts.actor,
      action: "COUPON_DELETED",
      target: `${COUPONS_COLLECTION}/${code}`,
      meta: {},
    });
  }
}

// ───────────────────────────────────────────────────────────────
// Listing + usage stats
// ───────────────────────────────────────────────────────────────

export interface CouponListFilter {
  search?: string | null;
  /** "active" | "inactive" | "scheduled" | "expired" | null (all) */
  status?: string | null;
  sellerId?: string | null;
}

function couponStatus(doc: CouponDoc, nowMs: number): string {
  if (!doc.active) return "inactive";
  if (doc.startAt != null && doc.startAt > 0 && nowMs < doc.startAt) return "scheduled";
  if (doc.expiresAt != null && nowMs >= doc.expiresAt) return "expired";
  return "active";
}

export async function listCouponsAdmin(
  projectId: string,
  filter: CouponListFilter = {},
  limit = 500,
): Promise<Array<CouponDoc & { status: string }>> {
  const rows = await runFirestoreQuery(projectId, {
    from: [{ collectionId: COUPONS_COLLECTION, allDescendants: false }],
    orderBy: [{ field: { fieldPath: "code" }, direction: "ASCENDING" }],
    limit,
  });
  const now = Date.now();
  const out: Array<CouponDoc & { status: string }> = [];
  for (const row of rows) {
    const raw = (row["document"] ?? {}) as { fields?: Record<string, unknown>; name?: string };
    if (!raw.fields) continue;
    const name = String(raw.name ?? "");
    const code = name.split("/").pop() ?? "";
    const doc = fromCouponDoc(code, fromFsFields(raw.fields as Record<string, FsValue>));
    const status = couponStatus(doc, now);
    if (filter.sellerId != null && (doc.sellerId ?? null) !== filter.sellerId) continue;
    if (filter.status && status !== filter.status) continue;
    if (filter.search) {
      const q = filter.search.trim().toUpperCase();
      if (!code.includes(q)) continue;
    }
    out.push({ ...doc, status });
  }
  return out;
}

export interface CouponUsageStats {
  coupon: CouponDoc;
  status: string;
  usesRemaining: number | null;
  recentRedemptions: Array<{
    id: string;
    orderId: string;
    userId: string;
    sellerId: string | null;
    discount: number;
    base: number;
    createdAt: number;
  }>;
}

export async function getUsageStats(projectId: string, rawCode: string): Promise<CouponUsageStats> {
  const code = normalizeCouponCode(rawCode);
  const existing = await readCoupon(projectId, code);
  if (!existing) fail("coupon/notfound", `coupon/notfound: ${code}`);
  const now = Date.now();
  const status = couponStatus(existing.doc, now);

  const rows = await runFirestoreQuery(projectId, {
    from: [{ collectionId: COUPON_REDEMPTIONS_COLLECTION, allDescendants: false }],
    where: {
      fieldFilter: { field: { fieldPath: "code" }, op: "EQUAL", value: { stringValue: code } },
    },
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
    limit: 50,
  });
  const recentRedemptions = rows
    .map((row) => {
      const raw = (row["document"] ?? {}) as { fields?: Record<string, unknown>; name?: string };
      if (!raw.fields) return null;
      const f = fromFsFields(raw.fields as Record<string, FsValue>);
      const id =
        String(raw.name ?? "")
          .split("/")
          .pop() ?? "";
      return {
        id,
        orderId: String(f["orderId"] ?? ""),
        userId: String(f["userId"] ?? ""),
        sellerId: (f["sellerId"] as string | null) ?? null,
        discount: Number(f["discount"] ?? 0),
        base: Number(f["base"] ?? 0),
        createdAt: Number(f["createdAt"] ?? 0),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return {
    coupon: existing.doc,
    status,
    usesRemaining:
      existing.doc.usageLimit == null
        ? null
        : Math.max(0, existing.doc.usageLimit - existing.doc.uses),
    recentRedemptions,
  };
}

// ───────────────────────────────────────────────────────────────
// Checkout support — the redemption write builder
// ───────────────────────────────────────────────────────────────

export function couponCounterDocId(code: string, userId: string): string {
  return `${code}__${userId}`;
}

export function couponRedemptionDocId(code: string, orderId: string): string {
  return `${code}__${orderId}`;
}

export interface RedemptionWriteInput {
  code: string;
  userId: string;
  orderId: string;
  /** discount (taka) and base (taka) from a SUCCESSFUL evaluateCoupon */
  discount: number;
  base: number;
  /** the coupon doc snapshot the validation read — version + uses */
  couponUpdateTime: string | null;
  couponUses: number;
  /** per-customer counter snapshot (fetched at validation time) */
  counterExists: boolean;
  counterUpdateTime: string | null;
  counterUserUses: number;
  sellerId: string | null;
  nowMs: number;
}

/**
 * Build the atomic coupon redemption writes for the checkout commit:
 *   1. global `uses` increment — guarded by the coupon updateTime
 *      (concurrent last-usage checkouts collide here and the whole
 *      checkout aborts — no double redemption, no partial state);
 *   2. per-customer counter create/increment — same optimistic-lock
 *      discipline;
 *   3. immutable redemption record `{code}__{orderId}` with a
 *      create-only precondition — replay/retry of the SAME order can
 *      never double-write it.
 * All three go into the SAME single Firestore commit as the order
 * itself, so redemption either fully happens or fully doesn't.
 */
export function buildCouponRedemptionWrites(
  projectId: string,
  input: RedemptionWriteInput,
): FsWrite[] {
  const writes: FsWrite[] = [];
  const couponPath = docPath(projectId, [COUPONS_COLLECTION, input.code]);

  // 1. global uses increment — a masked plain write carrying the
  //    VALIDATED snapshot's value (uses + 1), guarded by that same
  //    snapshot's updateTime. Any concurrent writer bumps the
  //    updateTime, so two checkouts racing for the LAST usage
  //    collide here and the whole checkout aborts atomically.
  writes.push({
    update: {
      name: couponPath,
      fields: toFsFields({ uses: input.couponUses + 1 }),
    },
    updateMask: { fieldPaths: ["uses"] },
    ...(input.couponUpdateTime ? { currentDocument: { updateTime: input.couponUpdateTime } } : {}),
  });

  // 2. per-customer counter — same optimistic-lock discipline
  const counterPath = docPath(projectId, [
    COUPON_CUSTOMER_COUNTERS_COLLECTION,
    couponCounterDocId(input.code, input.userId),
  ]);
  if (input.counterExists) {
    writes.push({
      update: {
        name: counterPath,
        fields: toFsFields({
          count: input.counterUserUses + 1,
          updatedAt: input.nowMs,
        }),
      },
      updateMask: { fieldPaths: ["count", "updatedAt"] },
      ...(input.counterUpdateTime
        ? { currentDocument: { updateTime: input.counterUpdateTime } }
        : {}),
    });
  } else {
    writes.push({
      update: {
        name: counterPath,
        fields: toFsFields({
          code: input.code,
          userId: input.userId,
          count: 1,
          createdAt: input.nowMs,
          updatedAt: input.nowMs,
        }),
      },
      currentDocument: { exists: false },
    });
  }

  // 3. immutable redemption record
  writes.push({
    update: {
      name: docPath(projectId, [
        COUPON_REDEMPTIONS_COLLECTION,
        couponRedemptionDocId(input.code, input.orderId),
      ]),
      fields: toFsFields({
        code: input.code,
        orderId: input.orderId,
        userId: input.userId,
        sellerId: input.sellerId,
        discount: input.discount,
        base: input.base,
        createdAt: input.nowMs,
      }),
    },
    currentDocument: { exists: false },
  });

  return writes;
}

// Re-export the pure evaluation for checkout + tests.
export { evaluateCoupon, type LineForEvaluation, type CouponForEvaluation };

/** Convenience: extract a CouponForEvaluation from a fetched coupon doc. */
export function couponForEvaluation(
  code: string,
  data: Record<string, unknown>,
): CouponForEvaluation {
  return fromCouponDoc(code, data);
}

export type { FetchedDoc };
