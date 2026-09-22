/**
 * AVENTA SHOP — Seller coupon self-service (server-authoritative).
 *
 * Sellers may manage ONLY their own coupons (sellerId == uid), and
 * only through these server functions. The client SDK write path is
 * denied by the security rules — coupon mutations affect financial
 * amounts (discounts), so every write must flow through HERE where:
 *
 *   1. identity comes from the verified ID token (uid),
 *   2. the caller is a genuinely approved seller (users/{uid}.role
 *      == "seller" AND sellers/{uid}.status == "approved" — the same
 *      pair the rules used to check),
 *   3. every field passes the canonical validateCouponFields(),
 *   4. the coupon doc id is the normalized code (the shape the
 *      checkout/preview evaluation core reads — the legacy client
 *      addDoc(auto-id) path created coupons the engine could never
 *      see, i.e. coupons that silently never worked),
 *   5. every mutation lands in the shared kernel audit trail.
 *
 * Scope constraints enforced HERE (not trusted from the client):
 *   • sellerId is ALWAYS forced to the caller's uid (a seller can
 *     never create a global/platform coupon or one owned by a
 *     different seller — IDOR is structurally impossible),
 *   • delete only when uses == 0 (redemption history is immutable),
 *   • toggle only `active` (masked update — limits/value/uses can
 *     never be edited after creation, matching the old rules).
 */

import { batchGetDocs, commitWrites, docPath, toFsFields } from "../firebase-admin.server";
import { appendAuditEntry } from "../kernel/audit";
import {
  COUPONS_COLLECTION,
  normalizeCouponCode,
  validateCouponFields,
  setCouponActive,
  deleteCoupon,
  couponDocFields,
  listCouponsAdmin,
  type CouponDoc,
  type CouponAdminError,
} from "./coupon.server";
import type { CouponDiscountType } from "./evaluate";

export interface SellerCouponInput {
  code: string;
  type: CouponDiscountType;
  value: number;
  minSubtotal: number | null;
  expiresAt: number | null;
  usageLimit: number | null;
  productIds: string[];
  maxDiscount: number | null;
  active: boolean;
}

function fail(code: string, message: string): never {
  const err = new Error(message) as CouponAdminError;
  err.code = code;
  throw err;
}

// ───────────────────────────────────────────────────────────────
// Seller verification — mirrors the old rules' isApprovedSeller()
// ───────────────────────────────────────────────────────────────

export async function verifyCouponSeller(projectId: string, uid: string): Promise<void> {
  // Mirrors the canonical approved-seller check used everywhere else
  // in the app (SellerGate, seller-messages.server.ts, seller
  // inventory): sellers/{uid}.status === "approved" is the ONLY
  // source of truth for seller authorization. There is NO code path
  // anywhere in this app that ever sets users/{uid}.role to "seller"
  // — seller approval only ever writes the sellers/{uid} doc — so a
  // check requiring that role would reject every real seller.
  const [userPath, sellerPath] = [
    docPath(projectId, ["users", uid]),
    docPath(projectId, ["sellers", uid]),
  ];
  const docs = await batchGetDocs(projectId, [userPath, sellerPath]);
  const userDoc = docs.get(userPath);
  const sellerDoc = docs.get(sellerPath);
  // A missing users/{uid} doc is not itself disqualifying (legacy
  // accounts) — only an explicit blocked:true flag is enforced.
  if (userDoc?.exists && userDoc.data["blocked"] === true) {
    fail("coupon/unauthorized", "coupon/unauthorized: account is blocked.");
  }
  if (!sellerDoc?.exists || String(sellerDoc.data["status"] ?? "") !== "approved") {
    fail("coupon/unauthorized", "coupon/unauthorized: seller account is not approved.");
  }
}

/** Read a coupon doc (service account) and enforce caller ownership. */
async function readOwnedCoupon(
  projectId: string,
  uid: string,
  rawCode: string,
): Promise<CouponDoc> {
  const code = normalizeCouponCode(rawCode);
  const name = docPath(projectId, [COUPONS_COLLECTION, code]);
  const doc = (await batchGetDocs(projectId, [name])).get(name);
  if (!doc?.exists) {
    fail("coupon/notfound", `coupon/notfound: ${code}`);
  }
  const coupon = fromCouponServer(code, doc.data);
  if ((coupon.sellerId ?? "") !== uid) {
    // Same message as not-found — never leak another seller's coupon.
    fail("coupon/notfound", `coupon/notfound: ${code}`);
  }
  return coupon;
}

function fromCouponServer(code: string, plain: Record<string, unknown>): CouponDoc {
  return {
    code,
    type: String(plain["type"] ?? "fixed") as CouponDiscountType,
    value: Number(plain["value"] ?? 0),
    minSubtotal: plain["minSubtotal"] == null ? null : Number(plain["minSubtotal"]),
    startAt: plain["startAt"] == null ? null : Number(plain["startAt"]),
    expiresAt: plain["expiresAt"] == null ? null : Number(plain["expiresAt"]),
    active: plain["active"] === true,
    usageLimit: plain["usageLimit"] == null ? null : Number(plain["usageLimit"]),
    uses: Number(plain["uses"] ?? 0),
    perCustomerLimit: plain["perCustomerLimit"] == null ? null : Number(plain["perCustomerLimit"]),
    sellerId: (plain["sellerId"] as string | null) ?? null,
    productIds: Array.isArray(plain["productIds"]) ? (plain["productIds"] as string[]) : [],
    categoryIds: Array.isArray(plain["categoryIds"]) ? (plain["categoryIds"] as string[]) : [],
    maxDiscount: plain["maxDiscount"] == null ? null : Number(plain["maxDiscount"]),
    createdAt: Number(plain["createdAt"] ?? 0),
    updatedAt: Number(plain["updatedAt"] ?? 0),
  };
}

function cleanIds(raw: string[] | undefined): string[] {
  if (!raw) return [];
  return Array.from(new Set(raw.map((s) => String(s).trim()).filter(Boolean)));
}

// ───────────────────────────────────────────────────────────────
// Scoped mutations
// ───────────────────────────────────────────────────────────────

export async function createSellerCouponServer(
  projectId: string,
  uid: string,
  input: SellerCouponInput,
): Promise<CouponDoc> {
  await verifyCouponSeller(projectId, uid);
  const code = normalizeCouponCode(input.code ?? "");
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
    fail(
      "coupon/validation",
      "coupon/validation: Code must be 3-24 characters (A-Z, 0-9, _ or -).",
    );
  }
  const fields = {
    type: input.type,
    value: input.value,
    sellerId: uid, // forced — a seller can only create their own coupons
    minSubtotal: input.minSubtotal ?? null,
    startAt: null,
    expiresAt: input.expiresAt ?? null,
    usageLimit: input.usageLimit ?? null,
    perCustomerLimit: null, // seller self-service tier has no per-customer cap UI
    productIds: cleanIds(input.productIds),
    categoryIds: [], // platform-only scoping (category rules need admin curation)
    maxDiscount: input.maxDiscount ?? null,
  };
  const err = validateCouponFields(fields);
  if (err) fail("coupon/validation", `coupon/validation: ${err}`);

  const now = Date.now();
  const doc: CouponDoc = {
    ...fields,
    code,
    uses: 0,
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  // Doc id IS the code; the create-only precondition makes duplicate
  // codes structurally impossible (atomic, race-safe) — the exact
  // admin-core shape the checkout evaluation core reads.
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [COUPONS_COLLECTION, code]),
        fields: toFsFields(couponDocFields(doc) as Record<string, unknown>),
      },
      currentDocument: { exists: false },
    },
  ]);
  await appendAuditEntry(projectId, {
    actor: { id: `seller:${uid}`, role: "seller" },
    action: "COUPON_CREATED",
    target: `${COUPONS_COLLECTION}/${code}`,
    meta: {
      type: doc.type,
      value: doc.value,
      sellerId: doc.sellerId,
      expiresAt: doc.expiresAt,
      usageLimit: doc.usageLimit,
    },
  });
  return doc;
}

export async function setSellerCouponActiveServer(
  projectId: string,
  uid: string,
  rawCode: string,
  active: boolean,
): Promise<CouponDoc> {
  await verifyCouponSeller(projectId, uid);
  // Ownership enforced before the mutation.
  await readOwnedCoupon(projectId, uid, rawCode);
  return setCouponActive(projectId, rawCode, active, null, {
    actor: { id: `seller:${uid}`, role: "seller" },
  });
}

export async function deleteSellerCouponServer(
  projectId: string,
  uid: string,
  rawCode: string,
): Promise<void> {
  await verifyCouponSeller(projectId, uid);
  const coupon = await readOwnedCoupon(projectId, uid, rawCode);
  // Financial history is immutable — never-redeemed coupons only.
  if (coupon.uses > 0) {
    fail(
      "coupon/in-use",
      `coupon/in-use: ${coupon.code} has ${coupon.uses} redemption(s) — disable it instead of deleting.`,
    );
  }
  await deleteCoupon(projectId, rawCode, {
    actor: { id: `seller:${uid}`, role: "seller" },
  });
}

export async function listSellerCouponsServer(
  projectId: string,
  uid: string,
): Promise<CouponDoc[]> {
  await verifyCouponSeller(projectId, uid);
  const rows = await listCouponsAdmin(projectId, { sellerId: uid });
  return rows.map(({ status: _status, ...doc }) => doc);
}
