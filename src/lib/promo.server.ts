/**
 * AVENTA SHOP — Promo Code Server Module
 *
 * Runs ONLY inside server function handlers. Uses the Firebase service account
 * to talk to the Firestore REST API, bypassing security rules. All promo code
 * generation, validation, and mutation happen here — the client can NEVER
 * generate, modify, or trust its own promo codes.
 *
 * Architecture:
 * - Promo codes live in a top-level "promoCodes" collection for O(1) uniqueness
 *   checks by document ID (the code itself is the doc ID).
 * - Generation uses cryptographic randomness via crypto.getRandomValues.
 * - Collision handling retries up to a configurable max, then returns a
 *   controlled error if the code space is saturated.
 * - Code length (numeric digits) is configurable for future upgrade from
 *   AVENTA###### (6 digits, 1M codes). Historical NEXA#### codes remain valid.
 * - The "coupons" collection already handles admin-created coupons. Promo codes
 *   are a separate, user-bound system — but checkout validates both.
 */

import {
  batchGetDocs,
  commitWrites,
  docPath,
  fromFsFields,
  getAccessToken,
  getProjectId,
  newDocId,
  toFsFields,
  type FsValue,
} from "./firebase-admin.server";

// ====================================================================
// Config
// ====================================================================

export const PROMO_PREFIX = "AVENTA";
export const PROMO_NUMERIC_LENGTH = 6; // 6 digits = 1M code capacity
const MAX_GENERATE_ATTEMPTS = 50; // Safety valve against infinite loops
const COLLECTION = "promoCodes";

// Discount defaults for auto-generated promo codes
const DEFAULT_DISCOUNT_TYPE = "percent" as const;
const DEFAULT_DISCOUNT_VALUE = 10; // 10% off
const DEFAULT_MIN_ORDER = 0;
const DEFAULT_USAGE_LIMIT = 1; // Single-use by default
const DEFAULT_EXPIRY_DAYS = 30;

// ====================================================================
// Types
// ====================================================================

export type PromoDiscountType = "percent" | "fixed";
export type PromoCampaignType =
  | "first_order"
  | "welcome"
  | "campaign"
  | "admin_issued";

export type PromoStatus = "active" | "used" | "expired" | "disabled";

export interface PromoCode {
  code: string;
  userId: string;
  status: PromoStatus;
  campaignType: PromoCampaignType;
  discountType: PromoDiscountType;
  discountValue: number;
  minimumOrderAmount: number;
  usageLimit: number;
  usedCount: number;
  expiresAt: number; // epoch ms
  createdAt: number;
  updatedAt: number;
  usedAt: number | null;
  usedOrderId: string | null;
}

// ====================================================================
// Firestore helpers
// ====================================================================

function baseUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function mapPromo(code: string, data: Record<string, unknown>): PromoCode {
  return {
    code,
    userId: String(data.userId ?? ""),
    status: (data.status as PromoStatus) ?? "active",
    campaignType: (data.campaignType as PromoCampaignType) ?? "welcome",
    discountType: (data.discountType as PromoDiscountType) ?? "percent",
    discountValue: Number(data.discountValue ?? 0),
    minimumOrderAmount: Number(data.minimumOrderAmount ?? 0),
    usageLimit: Number(data.usageLimit ?? 1),
    usedCount: Number(data.usedCount ?? 0),
    expiresAt: Number(data.expiresAt ?? 0),
    createdAt: Number(data.createdAt ?? Date.now()),
    updatedAt: Number(data.updatedAt ?? Date.now()),
    usedAt: data.usedAt != null ? Number(data.usedAt) : null,
    usedOrderId: data.usedOrderId != null ? String(data.usedOrderId) : null,
  };
}

// ====================================================================
// Code Generation
// ====================================================================

/**
 * Generates a single candidate code: PREFIX + N random digits.
 * Uses crypto.getRandomValues for cryptographic randomness.
 */
export function generateCandidateCode(
  prefix: string = PROMO_PREFIX,
  numericLength: number = PROMO_NUMERIC_LENGTH,
): string {
  const digits = "0123456789";
  const bytes = new Uint8Array(numericLength);
  crypto.getRandomValues(bytes);
  let numeric = "";
  for (let i = 0; i < numericLength; i++) {
    numeric += digits[bytes[i] % digits.length];
  }
  return `${prefix.toUpperCase()}${numeric}`;
}

/**
 * Checks whether a code already exists in the promoCodes collection.
 * Uses a document get (by doc ID = code) for O(1) lookup.
 */
async function codeExists(
  projectId: string,
  code: string,
): Promise<boolean> {
  const result = await batchGetDocs(projectId, [
    docPath(projectId, [COLLECTION, code]),
  ]);
  const doc = result.get(docPath(projectId, [COLLECTION, code]));
  return doc?.exists === true;
}

/**
 * Generates a unique promo code with collision handling.
 * Retries up to MAX_GENERATE_ATTEMPTS times. If the code space is
 * saturated, returns a controlled error instead of looping forever.
 */
export async function generateUniquePromoCode(
  projectId: string,
  options?: {
    prefix?: string;
    numericLength?: number;
  },
): Promise<string> {
  const prefix = options?.prefix ?? PROMO_PREFIX;
  const numericLength = options?.numericLength ?? PROMO_NUMERIC_LENGTH;

  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
    const candidate = generateCandidateCode(prefix, numericLength);
    if (!(await codeExists(projectId, candidate))) {
      return candidate;
    }
    // Collision — try another
  }

  // Code space is highly occupied
  const maxCombinations = Math.pow(10, numericLength);
  throw new Error(
    `Promo code space is nearly exhausted (${MAX_GENERATE_ATTEMPTS} collisions). ` +
      `Consider increasing numericLength from ${numericLength} to ${numericLength + 2}. ` +
      `Current capacity: ${maxCombinations.toLocaleString()} codes.`,
  );
}

// ====================================================================
// Qualifying Action Check
// ====================================================================

/**
 * Checks whether a user qualifies for a promo code of the given campaign type.
 *
 * Configurable business logic — currently supports:
 * - "first_order": user has at least 1 completed order
 * - "welcome": user has no existing promo code of this campaign type
 * - "campaign": admin-defined campaign (no auto-qualification)
 * - "admin_issued": admin creates codes manually
 *
 * Each check runs server-side against Firestore — the client cannot
 * influence the result.
 */
export async function checkQualification(
  projectId: string,
  uid: string,
  campaignType: PromoCampaignType,
): Promise<{ qualified: boolean; reason?: string }> {
  const token = await getAccessToken();

  // Check if user already has a promo code of this campaign type
  const existingRes = await fetch(
    `${baseUrl(projectId)}:runQuery`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: COLLECTION }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: "userId" },
                    op: "EQUAL",
                    value: { stringValue: uid },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: "campaignType" },
                    op: "EQUAL",
                    value: { stringValue: campaignType },
                  },
                },
              ],
            },
          },
          limit: 1,
        },
      }),
    },
  );

  if (!existingRes.ok) {
    throw new Error("Could not verify promo eligibility. Please try again.");
  }

  const existingJson = (await existingRes.json()) as Array<{
    document?: { fields?: Record<string, FsValue> };
  }>;
  const alreadyHas = existingJson.some((r) => r.document);

  if (alreadyHas) {
    return {
      qualified: false,
      reason: "You already have a promo code for this campaign.",
    };
  }

  // For "first_order" campaigns, verify the user has at least one order
  if (campaignType === "first_order") {
    const ordersRes = await fetch(
      `${baseUrl(projectId)}/users/${encodeURIComponent(uid)}/orders?pageSize=1`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!ordersRes.ok) {
      throw new Error("Could not verify order history. Please try again.");
    }
    const ordersJson = (await ordersRes.json()) as {
      documents?: unknown[];
    };
    if (!ordersJson.documents || ordersJson.documents.length === 0) {
      return {
        qualified: false,
        reason: "Place your first order to unlock this promo code.",
      };
    }
  }

  return { qualified: true };
}

// ====================================================================
// Create Promo Code (Server-Side Only)
// ====================================================================

export interface CreatePromoInput {
  uid: string;
  campaignType: PromoCampaignType;
  discountType?: PromoDiscountType;
  discountValue?: number;
  minimumOrderAmount?: number;
  usageLimit?: number;
  expiryDays?: number;
  prefix?: string;
  numericLength?: number;
}

/**
 * Generates a unique promo code and saves it atomically to Firestore.
 * The document ID is the code itself, guaranteeing global uniqueness.
 * Uses currentDocument: { exists: false } as a create guard — if two
 * requests generate the same code simultaneously, only one succeeds.
 */
export async function createPromoCodeServer(
  input: CreatePromoInput,
): Promise<PromoCode> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  // Check qualification
  const qualification = await checkQualification(
    projectId,
    input.uid,
    input.campaignType,
  );
  if (!qualification.qualified) {
    throw new Error(qualification.reason ?? "Not eligible for this promo code.");
  }

  // Generate unique code
  const code = await generateUniquePromoCode(projectId, {
    prefix: input.prefix,
    numericLength: input.numericLength,
  });

  const nowMs = Date.now();
  const expiresAt = nowMs + (input.expiryDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000;

  const promoData: Record<string, unknown> = {
    code,
    userId: input.uid,
    status: "active",
    campaignType: input.campaignType,
    discountType: input.discountType ?? DEFAULT_DISCOUNT_TYPE,
    discountValue: input.discountValue ?? DEFAULT_DISCOUNT_VALUE,
    minimumOrderAmount: input.minimumOrderAmount ?? DEFAULT_MIN_ORDER,
    usageLimit: input.usageLimit ?? DEFAULT_USAGE_LIMIT,
    usedCount: 0,
    expiresAt,
    createdAt: nowMs,
    updatedAt: nowMs,
    usedAt: null,
    usedOrderId: null,
  };

  // Atomically create — fails if doc already exists (race condition guard)
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [COLLECTION, code]),
        fields: toFsFields(promoData),
      },
      currentDocument: { exists: false },
    },
  ]);

  return mapPromo(code, promoData);
}

// ====================================================================
// Admin: Create Promo Code for a Specific User
// ====================================================================

export interface AdminCreatePromoInput extends Omit<CreatePromoInput, "uid"> {
  uid: string; // target user
  adminUid: string; // admin creating the code
}

export async function adminCreatePromoCodeServer(
  input: AdminCreatePromoInput,
): Promise<PromoCode> {
  const projectId = getProjectId();

  // Generate unique code (skip qualification check for admin-issued)
  const code = await generateUniquePromoCode(projectId, {
    prefix: input.prefix,
    numericLength: input.numericLength,
  });

  const nowMs = Date.now();
  const expiresAt = nowMs + (input.expiryDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000;

  const promoData: Record<string, unknown> = {
    code,
    userId: input.uid,
    status: "active",
    campaignType: input.campaignType ?? "admin_issued",
    discountType: input.discountType ?? DEFAULT_DISCOUNT_TYPE,
    discountValue: input.discountValue ?? DEFAULT_DISCOUNT_VALUE,
    minimumOrderAmount: input.minimumOrderAmount ?? DEFAULT_MIN_ORDER,
    usageLimit: input.usageLimit ?? DEFAULT_USAGE_LIMIT,
    usedCount: 0,
    expiresAt,
    createdAt: nowMs,
    updatedAt: nowMs,
    usedAt: null,
    usedOrderId: null,
    createdBy: input.adminUid,
  };

  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [COLLECTION, code]),
        fields: toFsFields(promoData),
      },
      currentDocument: { exists: false },
    },
  ]);

  return mapPromo(code, promoData);
}

// ====================================================================
// Validate Promo Code (Server-Side, for Checkout)
// ====================================================================

export interface PromoValidationResult {
  valid: boolean;
  promo?: PromoCode;
  discount: number;
  reason?: string;
}

/**
 * Validates a promo code server-side. Called by checkout.server.ts.
 * Never trusts client-side discount calculations.
 *
 * Returns the promo record + computed discount, or an error reason.
 */
export async function validatePromoCodeServer(
  projectId: string,
  code: string,
  uid: string,
  subtotal: number,
): Promise<PromoValidationResult> {
  const normalized = code.trim().toUpperCase();

  // Fetch the promo doc by code (doc ID)
  const docs = await batchGetDocs(projectId, [
    docPath(projectId, [COLLECTION, normalized]),
  ]);
  const doc = docs.get(docPath(projectId, [COLLECTION, normalized]));

  if (!doc?.exists) {
    return { valid: false, discount: 0, reason: "Promo code not found." };
  }

  const data = fromFsFields(doc.data as unknown as Record<string, FsValue>);
  const promo = mapPromo(normalized, data);

  // Check ownership — promo code belongs to the requesting user
  if (promo.userId !== uid) {
    return { valid: false, discount: 0, reason: "This promo code is not valid for your account." };
  }

  // Check status
  if (promo.status !== "active") {
    return { valid: false, discount: 0, reason: `Promo code is ${promo.status}.` };
  }

  // Check expiry
  const nowMs = Date.now();
  if (promo.expiresAt > 0 && nowMs > promo.expiresAt) {
    return { valid: false, discount: 0, reason: "This promo code has expired." };
  }

  // Check usage limit
  if (promo.usedCount >= promo.usageLimit) {
    return { valid: false, discount: 0, reason: "This promo code has already been used." };
  }

  // Check minimum order amount
  if (subtotal < promo.minimumOrderAmount) {
    return {
      valid: false,
      discount: 0,
      reason: `Minimum order of ${promo.minimumOrderAmount.toFixed(2)} required for this promo code.`,
    };
  }

  // Compute discount
  const discount =
    promo.discountType === "percent"
      ? Math.min(subtotal, Math.round(subtotal * (promo.discountValue / 100) * 100) / 100)
      : Math.min(subtotal, promo.discountValue);

  return {
    valid: true,
    promo,
    discount: Math.round(discount * 100) / 100,
  };
}

// ====================================================================
// Mark Promo Code as Used (Server-Side, after order is placed)
// ====================================================================

/**
 * Marks a promo code as used after a successful order.
 * Atomically increments usedCount and sets status to "used" if limit reached.
 * Returns a write operation to be included in the checkout batch commit.
 */
export function buildPromoUseWrite(
  projectId: string,
  code: string,
  orderId: string,
  nowMs: number,
): Record<string, unknown> {
  return {
    transform: {
      document: docPath(projectId, [COLLECTION, code]),
      fieldTransforms: [
        { fieldPath: "usedCount", increment: { integerValue: "1" } },
        { fieldPath: "updatedAt", setToValue: { timestampValue: new Date(nowMs).toISOString() } },
        { fieldPath: "usedAt", setToValue: { timestampValue: new Date(nowMs).toISOString() } },
        { fieldPath: "usedOrderId", setToValue: { stringValue: orderId } },
      ],
    },
  };
}

/**
 * After incrementing usedCount, we need to conditionally set status to "used"
 * if usedCount >= usageLimit. This is done as a separate step.
 * For now, we set status in the same write for single-use codes (most common).
 */
export function buildPromoStatusUpdateWrite(
  projectId: string,
  code: string,
  nowMs: number,
): Record<string, unknown> {
  return {
    update: {
      name: docPath(projectId, [COLLECTION, code]),
      fields: toFsFields({
        status: "used",
        updatedAt: nowMs,
      }),
    },
    updateMask: { fieldPaths: ["status", "updatedAt"] },
  };
}

// ====================================================================
// List User's Promo Codes (Server-Side Read)
// ====================================================================

export async function listUserPromoCodesServer(
  uid: string,
): Promise<PromoCode[]> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  const res = await fetch(
    `${baseUrl(projectId)}:runQuery`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: COLLECTION }],
          where: {
            fieldFilter: {
              field: { fieldPath: "userId" },
              op: "EQUAL",
              value: { stringValue: uid },
            },
          },
          orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error("Could not load your promo codes. Please try again.");
  }

  const json = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, FsValue> };
  }>;

  const promos: PromoCode[] = [];
  for (const row of json) {
    if (!row.document) continue;
    const code = row.document.name.split("/").pop() ?? "";
    const data = fromFsFields(row.document.fields ?? {});
    promos.push(mapPromo(code, data));
  }

  return promos;
}

// ====================================================================
// Admin: List All Promo Codes
// ====================================================================

export async function listAllPromoCodesServer(
  limit: number = 100,
): Promise<PromoCode[]> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  const res = await fetch(
    `${baseUrl(projectId)}/${COLLECTION}?pageSize=${limit}&orderBy=createdAt%20DESC`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    throw new Error("Could not load promo codes.");
  }

  const json = (await res.json()) as {
    documents?: Array<{ name: string; fields?: Record<string, FsValue> }>;
  };

  return (json.documents ?? []).map((d) => {
    const code = d.name.split("/").pop() ?? "";
    return mapPromo(code, fromFsFields(d.fields ?? {}));
  });
}

// ====================================================================
// Admin: Disable Promo Code
// ====================================================================

export async function disablePromoCodeServer(code: string): Promise<void> {
  const projectId = getProjectId();
  const normalized = code.trim().toUpperCase();

  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [COLLECTION, normalized]),
        fields: toFsFields({
          status: "disabled",
          updatedAt: Date.now(),
        }),
      },
      updateMask: { fieldPaths: ["status", "updatedAt"] },
    },
  ]);
}

// ====================================================================
// Auto-Expire Check (can be called periodically)
// ====================================================================

export async function expireOldPromoCodesServer(): Promise<number> {
  const projectId = getProjectId();
  const token = await getAccessToken();
  const nowMs = Date.now();
  let expired = 0;

  // Query active promo codes where expiresAt < now
  const res = await fetch(
    `${baseUrl(projectId)}:runQuery`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: COLLECTION }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: "status" },
                    op: "EQUAL",
                    value: { stringValue: "active" },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: "expiresAt" },
                    op: "LESS_THAN",
                    value: { integerValue: String(nowMs) },
                  },
                },
              ],
            },
          },
          limit: 500,
        },
      }),
    },
  );

  if (!res.ok) return 0;

  const json = (await res.json()) as Array<{
    document?: { name: string };
  }>;

  const writes: Record<string, unknown>[] = [];
  for (const row of json) {
    if (!row.document) continue;
    const code = row.document.name.split("/").pop() ?? "";
    writes.push({
      update: {
        name: docPath(projectId, [COLLECTION, code]),
        fields: toFsFields({ status: "expired", updatedAt: nowMs }),
      },
      updateMask: { fieldPaths: ["status", "updatedAt"] },
    });
    expired++;
  }

  if (writes.length > 0) {
    await commitWrites(projectId, writes);
  }

  return expired;
}
