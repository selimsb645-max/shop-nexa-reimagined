/**
 * Coupon preview (customer-facing, read-only) — emulator tests.
 *
 * The preview MUST answer exactly what the canonical evaluation core
 * (the same rules as the checkout redemption) answers: lifecycle
 * window, usage limits, per-customer counters, min order, scope —
 * with flash-sale-adjusted prices as the discount base. It performs
 * NO writes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";
import { batchGetDocs, commitWrites, docPath, toFsFields } from "../../firebase-admin.server";
import { previewCouponServer } from "../preview.server";
import { COUPON_CUSTOMER_COUNTERS_COLLECTION } from "../coupon.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8098;
const PID = "test-project";

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORT}`;
  process.env.FIRESTORE_TEST_PROJECT = PID;
  delete process.env.NODE_ENV;
  emulatorServer = await createFirestoreEmulator(EMULATOR_PORT);
});
afterAll(async () => {
  await closeFirestoreEmulator(emulatorServer);
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_TEST_PROJECT;
});
beforeEach(() => {
  clearEmulatorStore();
});

const now = Date.now();
const HOUR = 3_600_000;

async function seedProduct(id: string, overrides: Record<string, unknown> = {}) {
  await commitWrites(PID, [
    {
      update: {
        name: docPath(PID, ["products", id]),
        fields: toFsFields({
          title: `Product ${id}`,
          price: 100,
          sellerId: null,
          categoryId: null,
          subcategoryId: null,
          ...overrides,
        }),
      },
      currentDocument: { exists: false },
    },
  ]);
}

async function seedCoupon(code: string, overrides: Record<string, unknown> = {}) {
  await commitWrites(PID, [
    {
      update: {
        name: docPath(PID, ["coupons", code]),
        fields: toFsFields({
          code,
          type: "percent",
          value: 10,
          minSubtotal: 0,
          startAt: null,
          expiresAt: null,
          active: true,
          usageLimit: null,
          uses: 0,
          perCustomerLimit: null,
          sellerId: null,
          productIds: [],
          categoryIds: [],
          maxDiscount: null,
          ...overrides,
        }),
      },
      currentDocument: { exists: false },
    },
  ]);
}

async function seedCounter(code: string, uid: string, count: number) {
  await commitWrites(PID, [
    {
      update: {
        name: docPath(PID, [COUPON_CUSTOMER_COUNTERS_COLLECTION, `${code}__${uid}`]),
        fields: toFsFields({ count, updatedAt: now }),
      },
      currentDocument: { exists: false },
    },
  ]);
}

async function seedFlashSale(productId: string, salePriceTaka: number) {
  await commitWrites(PID, [
    {
      update: {
        name: docPath(PID, ["flashSales", `fs-${productId}`]),
        fields: toFsFields({
          campaignId: `camp-${productId}`,
          productId,
          startAt: now - HOUR,
          endAt: now + HOUR,
          stockTotal: 10,
          stockReserved: 0,
          perCustomerLimit: 1,
          salePriceMinor: Math.round(salePriceTaka * 100),
          originalPriceMinor: 10000,
          active: true,
        }),
      },
      currentDocument: { exists: false },
    },
  ]);
}

const UID = "customer-1";
const cart = (items: Array<[string, number]>) =>
  items.map(([productId, quantity]) => ({ productId, quantity }));

describe("previewCouponServer — server-authoritative preview", () => {
  it("returns the engine's discount for a valid percent coupon", async () => {
    await seedProduct("p1", { price: 200 });
    await seedCoupon("SAVE10");
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["p1", 2]]),
      couponCode: "save10",
    });
    expect(r).toEqual({
      ok: true,
      code: "SAVE10",
      discount: 40,
      base: 400,
      eligibleLines: 1,
      scoped: false,
    });
  });

  it("computes a fixed coupon over the flash-sale-adjusted base (pricing authority intact)", async () => {
    await seedProduct("p1", { price: 100 }); // 100 taka
    await seedFlashSale("p1", 60); // active sale: 60 taka
    await seedCoupon("FIX20", { type: "fixed", value: 20 });
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["p1", 1]]),
      couponCode: "FIX20",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // discount base is the flash price, NOT the original price
      expect(r.base).toBe(60);
      expect(r.discount).toBe(20);
    }
  });

  it("rejects an unknown code as coupon/not-found", async () => {
    await seedProduct("p1");
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["p1", 1]]),
      couponCode: "NOPE",
    });
    expect(r).toEqual({ ok: false, code: "NOPE", reason: "coupon/not-found" });
  });

  it("rejects a disabled coupon (coupon/not-active)", async () => {
    await seedProduct("p1");
    await seedCoupon("OFF", { active: false });
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["p1", 1]]),
      couponCode: "OFF",
    });
    expect(r).toEqual({ ok: false, code: "OFF", reason: "coupon/not-active" });
  });

  it("rejects a scheduled coupon (coupon/not-started)", async () => {
    await seedProduct("p1");
    await seedCoupon("LATER", { startAt: now + HOUR });
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["p1", 1]]),
      couponCode: "LATER",
    });
    expect(r).toEqual({ ok: false, code: "LATER", reason: "coupon/not-started" });
  });

  it("rejects an expired coupon (coupon/expired)", async () => {
    await seedProduct("p1");
    await seedCoupon("OLD", { expiresAt: now - HOUR });
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["p1", 1]]),
      couponCode: "OLD",
    });
    expect(r).toEqual({ ok: false, code: "OLD", reason: "coupon/expired" });
  });

  it("rejects a globally exhausted coupon (coupon/usage-exhausted)", async () => {
    await seedProduct("p1");
    await seedCoupon("GONE", { usageLimit: 5, uses: 5 });
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["p1", 1]]),
      couponCode: "GONE",
    });
    expect(r).toEqual({ ok: false, code: "GONE", reason: "coupon/usage-exhausted" });
  });

  it("rejects when the per-customer limit is reached (coupon/customer-limit)", async () => {
    await seedProduct("p1");
    await seedCoupon("ONCE", { perCustomerLimit: 1 });
    await seedCounter("ONCE", UID, 1);
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["p1", 1]]),
      couponCode: "ONCE",
    });
    expect(r).toEqual({ ok: false, code: "ONCE", reason: "coupon/customer-limit" });
  });

  it("anonymous preview ignores the per-customer counter (checkout enforces it)", async () => {
    await seedProduct("p1");
    await seedCoupon("ONCE", { perCustomerLimit: 1 });
    await seedCounter("ONCE", UID, 1);
    const r = await previewCouponServer({
      uid: null,
      items: cart([["p1", 1]]),
      couponCode: "ONCE",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects below the minimum order (coupon/min-subtotal)", async () => {
    await seedProduct("p1", { price: 50 });
    await seedCoupon("BIG", { minSubtotal: 100 });
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["p1", 1]]),
      couponCode: "BIG",
    });
    expect(r).toEqual({ ok: false, code: "BIG", reason: "coupon/min-subtotal" });
  });

  it("seller-scoped coupon discounts ONLY that seller's lines (multi-seller cart)", async () => {
    await seedProduct("pa", { sellerId: "sellerA", price: 100 });
    await seedProduct("pb", { sellerId: "sellerB", price: 900 });
    await seedCoupon("A10", { sellerId: "sellerA" });
    const r = await previewCouponServer({
      uid: UID,
      items: cart([
        ["pa", 1],
        ["pb", 1],
      ]),
      couponCode: "A10",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scoped).toBe(true);
      expect(r.eligibleLines).toBe(1);
      // base is seller A's line only — no cross-seller leakage
      expect(r.base).toBe(100);
      expect(r.discount).toBe(10);
    }
  });

  it("rejects a seller-scoped coupon when no eligible items exist (coupon/no-eligible-items)", async () => {
    await seedProduct("pb", { sellerId: "sellerB", price: 100 });
    await seedCoupon("A10", { sellerId: "sellerA" });
    const r = await previewCouponServer({
      uid: UID,
      items: cart([["pb", 1]]),
      couponCode: "A10",
    });
    expect(r).toEqual({
      ok: false,
      code: "A10",
      reason: "coupon/no-eligible-items",
    });
  });

  it("respects a category-scoped coupon", async () => {
    await seedProduct("pe", { categoryId: "electronics", price: 200 });
    await seedProduct("pf", { categoryId: "fashion", price: 800 });
    await seedCoupon("TECH", { categoryIds: ["electronics"] });
    const r = await previewCouponServer({
      uid: UID,
      items: cart([
        ["pe", 1],
        ["pf", 1],
      ]),
      couponCode: "TECH",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.eligibleLines).toBe(1);
      expect(r.base).toBe(200);
    }
  });

  it("performs no writes — coupons, counters and products are untouched", async () => {
    await seedProduct("p1");
    await seedCoupon("SAVE10", { uses: 3 });
    await previewCouponServer({
      uid: UID,
      items: cart([["p1", 1]]),
      couponCode: "SAVE10",
    });
    const docs = await batchGetDocs(PID, [
      docPath(PID, ["coupons", "SAVE10"]),
      docPath(PID, [COUPON_CUSTOMER_COUNTERS_COLLECTION, `SAVE10__${UID}`]),
    ]);
    const c = docs.get(docPath(PID, ["coupons", "SAVE10"]));
    expect(Number(c?.data["uses"] ?? 0)).toBe(3); // unchanged
    expect(
      docs.get(docPath(PID, [COUPON_CUSTOMER_COUNTERS_COLLECTION, `SAVE10__${UID}`]))?.exists,
    ).toBe(false); // no counter created by a preview
  });
});
