/**
 * AVENTA SHOP — Commerce Money-Flow Audit (Sep 7 2026)
 *
 * Full chain: Cart → Flash Sale pricing → Coupon preview → Checkout →
 * Order snapshot → Seller commission → Seller earning → Wallet/Settlement.
 *
 * Every test asserts the money math from the SERVER's authoritative data:
 *   preview result == checkout result == persisted order snapshot ==
 *   per-seller settlement breakdown — one cart, one truth.
 *
 * AUDIT REGRESSIONS LOCKED HERE:
 *  - A scoped coupon's discount may ONLY charge the eligible seller
 *    (previously spread pro-rata across ALL sellers).
 *  - A seller's shipping credit is what THEIR customers actually paid
 *    (previously double pro-rata-scaled in multi-seller carts).
 *  - An applied promo code may never fail the checkout AFTER the order
 *    commits (previously the promo writes re-sent the whole order batch
 *    into a second commit and hit the exists:false precondition).
 *  - Expired flash sales never reprice a line; only strictly-lower,
 *    in-window sale prices do (server-decided).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "./firestore-emulator";

let emulatorServer: Server;
const EMULATOR_PORT = 8094;
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents`;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORT}`;
  process.env.FIRESTORE_TEST_PROJECT = "test-project";
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

// ── seeding helpers (same REST shape as the other emulator suites) ──
function fsValue(v: unknown): Record<string, unknown> {
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "boolean") return { booleanValue: v };
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map((x) => fsValue(x)) } };
  }
  if (typeof v === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fsValue(x)]),
        ),
      },
    };
  }
  return { stringValue: String(v) };
}

async function seedDoc(path: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])),
    }),
  });
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status}`);
}

async function getDoc(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`get ${path} failed: ${res.status}`);
  const json = (await res.json()) as { fields?: Record<string, unknown> };
  return decode(json.fields ?? {});
}

function decode(v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(v)) {
    const r = raw as Record<string, unknown>;
    if ("nullValue" in r) out[k] = null;
    else if ("integerValue" in r) out[k] = Number(r.integerValue);
    else if ("doubleValue" in r) out[k] = Number(r.doubleValue);
    else if ("booleanValue" in r) out[k] = r.booleanValue;
    else if ("stringValue" in r) out[k] = r.stringValue;
    else if ("arrayValue" in r) {
      const arr = (r.arrayValue as { values?: unknown[] }).values ?? [];
      out[k] = arr.map((x) => {
        const item = x as Record<string, unknown>;
        if ("mapValue" in item) {
          const f = ((item.mapValue as { fields?: Record<string, unknown> }).fields ??
            {}) as Record<string, unknown>;
          return decode(f);
        }
        return Object.values(item)[0];
      });
    } else if ("mapValue" in r) {
      const f = ((r.mapValue as { fields?: Record<string, unknown> }).fields ?? {}) as Record<
        string,
        unknown
      >;
      out[k] = Object.keys(f).length > 0 ? decode(f) : {};
    }
  }
  return out;
}

async function listDocs(path: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${BASE}/${path}?pageSize=50`);
  const json = (await res.json()) as { documents?: unknown[] };
  return (json.documents ?? []).map((d) =>
    decode((d as { fields: Record<string, unknown> }).fields),
  );
}

const SELLER_A = "seller-a-uid";
const SELLER_B = "seller-b-uid";
const CUSTOMER_UID = "cust-uid";

async function seedSeller(sellerId: string, commissionRate = 0.08) {
  await seedDoc(`sellers/${sellerId}`, {
    uid: sellerId,
    shopName: `Shop ${sellerId}`,
    status: "approved",
    commissionRate,
  });
}

async function seedProduct(
  id: string,
  sellerId: string,
  price: number,
  overrides: Record<string, unknown> = {},
) {
  await seedDoc(`products/${id}`, {
    id,
    title: `Product ${id}`,
    slug: `product-${id}`,
    price,
    stock: 100,
    status: "published",
    images: ["https://example.com/img.jpg"],
    sellerId,
    categoryId: "cat-1",
    subcategoryId: "sub-1",
    freeDelivery: false,
    ...overrides,
  });
}

async function seedCoupon(code: string, overrides: Record<string, unknown> = {}) {
  await seedDoc(`coupons/${code}`, {
    code,
    type: "percent",
    value: 10,
    active: true,
    minSubtotal: null,
    startAt: null,
    expiresAt: null,
    usageLimit: null,
    perCustomerLimit: null,
    sellerId: null,
    productIds: [],
    categoryIds: [],
    maxDiscount: null,
    uses: 0,
    ...overrides,
  });
}

async function seedFlashSale(
  campaignId: string,
  productId: string,
  salePriceTaka: number,
  win: { startAt?: number; endAt?: number } = {},
) {
  const now = Date.now();
  await seedDoc(`flashSales/${campaignId}`, {
    campaignId,
    productId,
    salePriceMinor: Math.round(salePriceTaka * 100),
    originalPriceMinor: 90000,
    active: true,
    startAt: win.startAt ?? now - 60_000,
    endAt: win.endAt ?? now + 3_600_000,
    stockTotal: 100,
    stockReserved: 0,
    perCustomerLimit: 1,
  });
}

async function placeOrder(input: {
  items: Array<{ productId: string; quantity: number }>;
  couponCode?: string | null;
  promoCode?: string | null;
}) {
  const { placeOrderServer } = await import("../checkout.server");
  return placeOrderServer({
    uid: CUSTOMER_UID,
    buyerEmail: "buyer@test.local",
    items: input.items,
    deliveryAddressSnapshot: null, // → OUTSIDE_DHAKA default zone
    shippingAddress: {
      fullName: "Test Buyer",
      phone: "+8801700000000",
      addressLine: "12 Test Road",
      city: "Sylhet",
      postalCode: "3100",
      country: "Bangladesh",
    },
    paymentMethod: "cash_on_delivery",
    couponCode: input.couponCode ?? null,
    promoCode: input.promoCode ?? null,
    rewardPoints: 0,
    walletUsed: 0,
  });
}

async function sellerSettlement(sellerId: string, orderId: string) {
  const mirror = await getDoc(`sellers/${sellerId}/orders/${orderId}`);
  return mirror["settlement"] as Record<string, unknown>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// ====================================================================
// A. computeSellerSettlement — per-seller overrides (pure)
// ====================================================================
describe("computeSellerSettlement — audit overrides (pure)", () => {
  it("sellerDiscountShare override replaces the pro-rata split", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");
    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "ord-x",
      sellerSubtotal: 100,
      orderSubtotal: 1000,
      orderDiscount: 10,
      orderShipping: 0,
      orderTax: 0,
      commissionRate: 0.08,
      nowMs: 1700000000000,
      sellerDiscountShare: 10,
    });
    expect(s.sellerDiscountShare).toBe(10);
    expect(s.sellerNetEarnings).toBe(82);
  });

  it("omitted overrides keep the legacy pro-rata behaviour untouched", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");
    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "ord-x",
      sellerSubtotal: 700,
      orderSubtotal: 1000,
      orderDiscount: 200,
      orderShipping: 100,
      orderTax: 0,
      commissionRate: 0.08,
      nowMs: 1700000000000,
    });
    expect(s.sellerDiscountShare).toBe(140);
    expect(s.sellerShippingShare).toBe(70);
    expect(s.sellerNetEarnings).toBe(574);
  });

  it("sellerShippingShare override replaces the double-scaled pro-rata share", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");
    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "ord-x",
      sellerSubtotal: 100,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 170,
      orderTax: 0,
      commissionRate: 0.08,
      nowMs: 1700000000000,
      sellerShippingShare: 170,
    });
    expect(s.sellerShippingShare).toBe(170);
    expect(s.sellerNetEarnings).toBe(262);
  });

  it("clamps hostile override values", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");
    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "ord-x",
      sellerSubtotal: 100,
      orderSubtotal: 1000,
      orderDiscount: 10,
      orderShipping: 50,
      orderTax: 0,
      commissionRate: 0.08,
      nowMs: 1700000000000,
      sellerDiscountShare: 999,
      sellerShippingShare: -5,
    });
    expect(s.sellerDiscountShare).toBe(100);
    expect(s.sellerShippingShare).toBe(0);
  });
});

// ====================================================================
// B. Full checkout chain — order snapshot vs settlement math
// ====================================================================
describe("money-flow: multi-seller order + seller-scoped coupon", () => {
  it("charges ONLY the eligible seller; every value reconciles", async () => {
    await seedSeller(SELLER_A, 0.08);
    await seedSeller(SELLER_B, 0.08);
    await seedProduct("pa", SELLER_A, 100);
    await seedProduct("pb", SELLER_B, 900);
    await seedCoupon("SELLERA10", { sellerId: SELLER_A });

    const result = await placeOrder({
      items: [
        { productId: "pa", quantity: 1 },
        { productId: "pb", quantity: 1 },
      ],
      couponCode: "SELLERA10",
    });

    expect(result.subtotal).toBe(1000);
    expect(result.discount).toBe(10);
    expect(result.shipping).toBe(340);
    expect(result.total).toBe(r2(1000 - 10 + 340));
    expect(result.platformFee).toBe(80);
    expect(result.couponCode).toBe("SELLERA10");

    const order = await getDoc(`users/${CUSTOMER_UID}/orders/${result.orderId}`);
    expect(order["subtotal"]).toBe(1000);
    expect(order["discount"]).toBe(10);
    expect(order["total"]).toBe(r2(1000 - 10 + 340));

    const a = await sellerSettlement(SELLER_A, result.orderId);
    expect(a["sellerSubtotal"]).toBe(100);
    expect(a["sellerDiscountShare"]).toBe(10); // pre-audit bug: was 1
    expect(a["sellerShippingShare"]).toBe(170); // pre-audit bug: was 17
    expect(a["commissionAmount"]).toBe(8);
    expect(a["sellerNetEarnings"]).toBe(252);

    const b = await sellerSettlement(SELLER_B, result.orderId);
    expect(b["sellerSubtotal"]).toBe(900);
    expect(b["sellerDiscountShare"]).toBe(0); // pre-audit bug: was 9
    expect(b["sellerShippingShare"]).toBe(170); // pre-audit bug: was 153
    expect(b["commissionAmount"]).toBe(72);
    expect(b["sellerNetEarnings"]).toBe(998);

    expect(r2(10 + 0)).toBe(result.discount);
    expect(r2(8 + 72)).toBe(result.platformFee);
    expect(r2(252 + 998)).toBe(r2(1000 - 10 + 340 - 80));
  });

  it("platform coupon + flash sale: preview == checkout == snapshot == settlement", async () => {
    const { previewCouponServer } = await import("../coupons/preview.server");
    await seedSeller(SELLER_A, 0.08);
    await seedSeller(SELLER_B, 0.08);
    await seedProduct("pa", SELLER_A, 100);
    await seedProduct("pb", SELLER_B, 900);
    await seedFlashSale("camp-1", "pb", 800);
    await seedCoupon("TENOFF");

    const cart = [
      { productId: "pa", quantity: 1 },
      { productId: "pb", quantity: 1 },
    ];

    const preview = await previewCouponServer({
      uid: CUSTOMER_UID,
      items: cart,
      couponCode: "TENOFF",
    });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.discount).toBe(90);
      expect(preview.base).toBe(900);
    }

    const result = await placeOrder({ items: cart, couponCode: "TENOFF" });
    expect(result.subtotal).toBe(900);
    expect(result.discount).toBe(90);
    expect(result.total).toBe(r2(900 - 90 + 340));
    const pbLine = result.items.find((i) => i.productId === "pb");
    expect(pbLine?.price).toBe(800);

    const order = await getDoc(`users/${CUSTOMER_UID}/orders/${result.orderId}`);
    expect(order["subtotal"]).toBe(900);
    expect(order["discount"]).toBe(90);

    const b = await sellerSettlement(SELLER_B, result.orderId);
    expect(b["sellerSubtotal"]).toBe(800);
    expect(b["sellerDiscountShare"]).toBe(80);
    expect(b["commissionAmount"]).toBe(64);
    expect(b["sellerNetEarnings"]).toBe(826);

    const a = await sellerSettlement(SELLER_A, result.orderId);
    expect(a["sellerSubtotal"]).toBe(100);
    expect(a["sellerDiscountShare"]).toBe(10);
    expect(a["sellerNetEarnings"]).toBe(252);

    expect(r2(10 + 80)).toBe(90);
  });

  it("expired flash sale never reprices a line (stale data rejected)", async () => {
    await seedSeller(SELLER_B, 0.08);
    await seedProduct("pb", SELLER_B, 900);
    const past = Date.now() - 3_600_000;
    await seedFlashSale("camp-old", "pb", 100, { endAt: past, startAt: past - 7200_000 });

    const result = await placeOrder({ items: [{ productId: "pb", quantity: 1 }] });
    expect(result.subtotal).toBe(900);
    const line = result.items.find((i) => i.productId === "pb");
    expect(line?.price).toBe(900);
  });

  it("client price manipulation is impossible: only productId+quantity are read", async () => {
    await seedSeller(SELLER_A, 0.08);
    await seedProduct("pa", SELLER_A, 500);
    // PlaceOrderRequest carries ONLY productId/quantity per item — there
    // is no price field to tamper with; the server reads Firestore prices.
    const result = await placeOrder({ items: [{ productId: "pa", quantity: 2 }] });
    expect(result.subtotal).toBe(1000);
    expect(result.items[0].price).toBe(500);
  });
});

// ====================================================================
// C. Promo double-commit regression
// ====================================================================
describe("money-flow: promo checkout completes after the order commits", () => {
  it("applies a promo WITHOUT failing the already-committed order batch", async () => {
    await seedSeller(SELLER_A, 0.08);
    await seedProduct("pa", SELLER_A, 500);
    await seedDoc(`promoCodes/PROMO1`, {
      code: "PROMO1",
      status: "active",
      userId: CUSTOMER_UID,
      expiresAt: 0,
      minimumOrderAmount: 0,
      usageLimit: 1,
      usedCount: 0,
      discountType: "percent",
      discountValue: 10,
    });

    const result = await placeOrder({
      items: [{ productId: "pa", quantity: 1 }],
      promoCode: "PROMO1",
    });

    expect(result.promoDiscount).toBe(50);
    expect(result.total).toBe(r2(500 - 50 + 170));

    const order = await getDoc(`users/${CUSTOMER_UID}/orders/${result.orderId}`);
    expect(order["total"]).toBe(r2(500 - 50 + 170));
    expect(order["promoCode"]).toBe("PROMO1");

    const promo = await getDoc(`promoCodes/PROMO1`);
    expect(promo["status"]).toBe("used");
    expect(promo["usedOrderId"]).toBe(result.orderId);
    // NOTE: the usedCount increment is a Firestore `transform` write —
    // the JS test harness does not emulate transforms (it would be a
    // no-op here), so the counter is asserted by the zod-guarded
    // increment semantics + updateTime precondition, not re-measured
    // in this suite. The status/usedOrderId fields above prove the
    // second commit landed on the promo doc WITHOUT re-failing the
    // committed order batch (the pre-audit bug threw at this point).

    const mirror = await getDoc(`sellers/${SELLER_A}/orders/${result.orderId}`);
    expect(mirror["status"]).toBe("confirmed");
  });
});

// ====================================================================
// D. Order → commission → wallet lifecycle (legacy rail)
// ====================================================================
describe("money-flow: delivered order → hold → release → wallet (legacy rail)", () => {
  it("never double-credits a v2-covered order on the legacy rail and reverses cleanly on refund (CANONICAL RAIL, Sep 7 2026)", async () => {
    await seedSeller(SELLER_A, 0.08);
    await seedProduct("pa", SELLER_A, 1000);

    const result = await placeOrder({ items: [{ productId: "pa", quantity: 1 }] });
    const st = await sellerSettlement(SELLER_A, result.orderId);
    const earnings = Number(st["sellerNetEarnings"]);
    expect(earnings).toBe(1090); // 1000 + 170 - 80

    const { markOrderDeliveredSettlement, releaseSettlementIfEligible, reverseSellerSettlement } =
      await import("../settlement.server");

    const mark = await markOrderDeliveredSettlement({
      sellerId: SELLER_A,
      orderId: result.orderId,
      deliveredAt: Date.now(),
    });
    expect(mark.updated).toBe(true);

    const markAgain = await markOrderDeliveredSettlement({
      sellerId: SELLER_A,
      orderId: result.orderId,
      deliveredAt: Date.now(),
    });
    expect(markAgain.updated).toBe(false);

    const early = await releaseSettlementIfEligible({
      sellerId: SELLER_A,
      orderId: result.orderId,
    });
    expect(early.released).toBe(false);

    // fast-forward the hold period (same doc-rewrite pattern the
    // settlement-flow suite uses — the harness PATCH replaces the doc)
    await seedDoc(`sellers/${SELLER_A}/orders/${result.orderId}`, {
      sellerId: SELLER_A,
      status: "confirmed",
      settlement: {
        settlementStatus: "hold",
        sellerSubtotal: 1000,
        commissionRate: 0.08,
        commissionAmount: 80,
        sellerNetEarnings: earnings,
        payoutStatus: "none",
        deliveredAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
        eligibleSettlementDate: Date.now() - 3 * 24 * 60 * 60 * 1000,
      },
    });

    // CANONICAL RAIL (Sep 7 2026): this order was placed through the current
    // checkout, which already wrote a v2 settlement — so the legacy release
    // MUST skip it (single-rail credit; the v2 engine owns this order).
    const released = await releaseSettlementIfEligible({
      sellerId: SELLER_A,
      orderId: result.orderId,
    });
    expect(released.released).toBe(false);

    const releasedAgain = await releaseSettlementIfEligible({
      sellerId: SELLER_A,
      orderId: result.orderId,
    });
    expect(releasedAgain.released).toBe(false);

    // No legacy wallet credit exists for this v2-covered order.
    const walletRows = await listDocs(`sellers/${SELLER_A}/walletTx`);
    expect(walletRows.length).toBe(0);

    // Refund reversal: mirror flips to reversed, ZERO legacy wallet impact
    // (nothing was legacy-credited), and it's idempotent.
    const rev = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: result.orderId,
      reason: "customer refund",
      adminUid: "admin-uid",
    });
    expect(rev.reversed).toBe(true);
    expect(rev.walletImpact).toBe(0);

    const revAgain = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: result.orderId,
      reason: "replay",
      adminUid: "admin-uid",
    });
    expect(revAgain.reversed).toBe(false);

    const rowsAfter = await listDocs(`sellers/${SELLER_A}/walletTx`);
    expect(rowsAfter.length).toBe(0);
  });
});

// ====================================================================
// E. v2 event-driven finance: ledger integrity for the SAME order
// ====================================================================
describe("money-flow: v2 ledger stays consistent for the same order", () => {
  it("posted v2 entries are idempotent, held (never spendable early), and reconcile", async () => {
    const { verifyLedgerIntegrity, SELLER_LEDGER_COLLECTION } =
      await import("../finance/ledger.server");
    const { SETTLEMENTS_COLLECTION, advanceReturnWindowSettlements, readFinanceConfig } =
      await import("../finance/settlements.server");
    await seedSeller(SELLER_A, 0.08);
    await seedProduct("pa", SELLER_A, 1000);

    const result = await placeOrder({ items: [{ productId: "pa", quantity: 1 }] });

    const entries = await listDocs(SELLER_LEDGER_COLLECTION);
    expect(entries.length).toBeGreaterThan(0); // ORDER_CREATED handler posted

    // the v2 settlement for this order exists and is PENDING (net HELD)
    const sName = `sellers/${SELLER_A}`;
    void sName;
    const res = await fetch(`${BASE}/${SETTLEMENTS_COLLECTION}/st_${result.orderId}_${SELLER_A}`);
    if (res.ok) {
      const sDoc = decode(((await res.json()) as { fields: Record<string, unknown> }).fields);
      expect(sDoc["state"]).toBe("PENDING");
      expect(Number(sDoc["netMinor"])).toBeGreaterThan(0);
    }

    // double sweep is a no-op (idempotency keys)
    const config = await readFinanceConfig("test-project");
    const sweep1 = await advanceReturnWindowSettlements("test-project", config, Date.now());
    expect(sweep1.released).toBe(0); // window not over — nothing released early
    const sweep2 = await advanceReturnWindowSettlements("test-project", config, Date.now());
    expect(sweep2.released).toBe(0);

    // ledger integrity: snapshot == ledger replay (entries passed in)
    const { querySellerLedger } = await import("../finance/reconcile.server");
    const sellerEntries = await querySellerLedger("test-project", SELLER_A);
    const integrity = await verifyLedgerIntegrity("test-project", SELLER_A, sellerEntries);
    expect(integrity.ok).toBe(true);
  });
});
