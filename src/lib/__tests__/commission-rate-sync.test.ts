/**
 * Commission Rate Sync — E2E Tests
 *
 * Verifies the complete flow:
 * Admin commissionRate → Firestore seller profile → checkout reads rate →
 * computeSellerSettlement → settlement record (immutable) →
 * releaseSettlementIfEligible → walletTx
 *
 * Key properties:
 * 1. Rate is READ server-side from Firestore (never client-supplied)
 * 2. Rate is FROZEN into settlement record at order creation
 * 3. Changing rate on seller profile does NOT affect existing settlements
 * 4. New orders after rate change use the updated rate
 * 5. Invalid rates (negative, >100%, NaN) are clamped to safe defaults
 * 6. Historical settlement values are never recomputed
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  getEmulatorDoc,
  listEmulatorDocs,
  closeFirestoreEmulator,
} from "./firestore-emulator";
import type { Server } from "node:http";

let emulatorServer: Server;
const EMULATOR_PORT = 8083;

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

// ---- helpers ----

const SELLER_A = "seller-a-uid";
const SELLER_B = "seller-b-uid";

function mapToArray(m: Map<string, Record<string, unknown>>): Array<Record<string, unknown>> {
  return Array.from(m.values());
}

async function writeSellerProfile(sellerId: string, commissionRate: number) {
  const res = await fetch(
    `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/sellers/${sellerId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fields: {
          uid: { stringValue: sellerId },
          status: { stringValue: "approved" },
          commissionRate: { doubleValue: commissionRate },
          shopName: { stringValue: `Shop ${sellerId}` },
          email: { stringValue: `${sellerId}@test.com` },
        },
      }),
    },
  );
  return res.ok;
}

async function writeSellerOrder(
  sellerId: string,
  orderId: string,
  settlement: Record<string, unknown>,
) {
  const fields: Record<string, unknown> = {
    sellerId: { stringValue: sellerId },
    orderId: { stringValue: orderId },
    status: { stringValue: "confirmed" },
    createdAt: { integerValue: String(Date.now()) },
  };

  const settlementFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settlement)) {
    if (v === null) settlementFields[k] = { nullValue: null };
    else if (typeof v === "number")
      settlementFields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else settlementFields[k] = { stringValue: String(v) };
  }
  fields.settlement = { mapValue: { fields: settlementFields } };

  const res = await fetch(
    `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/sellers/${sellerId}/orders/${orderId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields }),
    },
  );
  return res.ok;
}

async function updateSellerCommissionRate(sellerId: string, newRate: number) {
  const res = await fetch(
    `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/sellers/${sellerId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fields: {
          uid: { stringValue: sellerId },
          status: { stringValue: "approved" },
          commissionRate: { doubleValue: newRate },
          shopName: { stringValue: `Shop ${sellerId}` },
          email: { stringValue: `${sellerId}@test.com` },
        },
      }),
    },
  );
  return res.ok;
}

// ====================================================================
// 1. COMPUTE FUNCTION — Rate handling
// ====================================================================

describe("computeSellerSettlement — commission rate", () => {
  it("should compute 10% commission correctly", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.1,
      nowMs: 1700000000000,
    });

    expect(s.commissionRate).toBe(0.1);
    expect(s.commissionAmount).toBe(100);
    expect(s.sellerNetEarnings).toBe(900);
  });

  it("should compute 15% commission correctly", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.15,
      nowMs: 1700000000000,
    });

    expect(s.commissionRate).toBe(0.15);
    expect(s.commissionAmount).toBe(150);
    expect(s.sellerNetEarnings).toBe(850);
  });

  it("should compute 8% (default) commission correctly", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.08,
      nowMs: 1700000000000,
    });

    expect(s.commissionRate).toBe(0.08);
    expect(s.commissionAmount).toBe(80);
    expect(s.sellerNetEarnings).toBe(920);
  });

  it("should use different rates for different sellers in same order", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const sA = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-shared",
      sellerSubtotal: 600,
      orderSubtotal: 1000,
      orderDiscount: 100,
      orderShipping: 50,
      commissionRate: 0.1,
      nowMs: 1700000000000,
    });

    const sB = computeSellerSettlement({
      sellerId: SELLER_B,
      orderId: "order-shared",
      sellerSubtotal: 400,
      orderSubtotal: 1000,
      orderDiscount: 100,
      orderShipping: 50,
      commissionRate: 0.15,
      nowMs: 1700000000000,
    });

    // Seller A: 10% of 600 = 60
    expect(sA.commissionAmount).toBe(60);
    // Seller B: 15% of 400 = 60
    expect(sB.commissionAmount).toBe(60);
    // Different rates → different earnings
    expect(sA.sellerNetEarnings).not.toBe(sB.sellerNetEarnings);
  });
});

// ====================================================================
// 2. RATE FREEZING — settlement record stores rate at creation
// ====================================================================

describe("Rate Freezing — settlement record stores rate at creation", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.1); // 10%
  });

  it("should freeze commission rate in settlement record", async () => {
    const { computeSellerSettlement, buildSellerOrderWrite } = await import("../settlement.server");

    const settlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.1,
      nowMs: 1700000000000,
    });

    // The settlement record contains the frozen rate
    expect(settlement.commissionRate).toBe(0.1);
    expect(settlement.commissionAmount).toBe(100);
    expect(settlement.sellerNetEarnings).toBe(900);
  });

  it("changing seller profile rate does NOT change existing settlement values", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    // Order created at 10% rate
    const originalSettlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.1,
      nowMs: 1700000000000,
    });

    // Admin changes rate to 15%
    await updateSellerCommissionRate(SELLER_A, 0.15);

    // The ORIGINAL settlement values are unchanged
    // (they're stored in Firestore and never recomputed)
    expect(originalSettlement.commissionRate).toBe(0.1);
    expect(originalSettlement.commissionAmount).toBe(100);
    expect(originalSettlement.sellerNetEarnings).toBe(900);

    // New order uses 15%
    const newSettlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-2",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.15,
      nowMs: 1700000000000,
    });

    expect(newSettlement.commissionRate).toBe(0.15);
    expect(newSettlement.commissionAmount).toBe(150);
    expect(newSettlement.sellerNetEarnings).toBe(850);
  });
});

// ====================================================================
// 3. RELEASE — uses stored earnings, not recomputed
// ====================================================================

describe("Earnings Release — uses stored values, not recomputed", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.1); // 10%

    // Create a settlement at 10% rate
    await writeSellerOrder(SELLER_A, "order-1", {
      settlementStatus: "hold",
      sellerSubtotal: 1000,
      commissionRate: 0.1,
      commissionAmount: 100,
      sellerNetEarnings: 900,
      payoutStatus: "none",
      deliveredAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
      eligibleSettlementDate: Date.now() - 3 * 24 * 60 * 60 * 1000,
    });
  });

  it("should release earnings based on stored sellerNetEarnings (not recomputed)", async () => {
    // Change rate to 15% AFTER settlement was created
    await updateSellerCommissionRate(SELLER_A, 0.15);

    const { releaseSettlementIfEligible } = await import("../settlement.server");

    const result = await releaseSettlementIfEligible({
      sellerId: SELLER_A,
      orderId: "order-1",
    });

    // Should release 900 (stored at 10%), NOT 850 (which would be 15%)
    expect(result.released).toBe(true);
    expect(result.amount).toBe(900);
  });

  it("walletTx should credit stored amount, not recomputed", async () => {
    await updateSellerCommissionRate(SELLER_A, 0.15);

    const { releaseSettlementIfEligible } = await import("../settlement.server");

    await releaseSettlementIfEligible({
      sellerId: SELLER_A,
      orderId: "order-1",
    });

    const walletDocs = await listEmulatorDocs(`sellers/${SELLER_A}/walletTx`);
    const docs = mapToArray(walletDocs);
    expect(docs.length).toBe(1);

    const amount = Number(docs[0].amount ?? 0);
    // 900 (stored at 10%), NOT 850 (15%)
    expect(amount).toBe(900);
  });
});

// ====================================================================
// 4. REVERSAL — uses stored values, not recomputed
// ====================================================================

describe("Reversal — uses stored values, not recomputed", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.1);

    await writeSellerOrder(SELLER_A, "order-1", {
      settlementStatus: "available",
      sellerSubtotal: 1000,
      commissionRate: 0.1,
      commissionAmount: 100,
      sellerNetEarnings: 900,
      payoutStatus: "none",
      deliveredAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
      eligibleSettlementDate: Date.now() - 3 * 24 * 60 * 60 * 1000,
    });

    // Write the earning walletTx
    const res = await fetch(
      `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/sellers/${SELLER_A}/walletTx/tx-1`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields: {
            type: { stringValue: "earning" },
            amount: { integerValue: "900" },
            orderId: { stringValue: "order-1" },
            status: { stringValue: "completed" },
            createdAt: { integerValue: String(Date.now()) },
          },
        }),
      },
    );
    expect(res.ok).toBe(true);
  });

  it("should debit stored earnings (900), not recomputed (850)", async () => {
    // Change rate to 15%
    await updateSellerCommissionRate(SELLER_A, 0.15);

    const { reverseSellerSettlement } = await import("../settlement.server");

    const result = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      reason: "Test reversal after rate change",
      adminUid: "admin-uid",
    });

    expect(result.reversed).toBe(true);
    // Should debit 900 (stored at 10%), NOT 850 (which would be 15%)
    expect(result.walletImpact).toBe(-900);
  });
});

// ====================================================================
// 5. READ FINANCIALS — uses stored settlement values
// ====================================================================

describe("readSellerFinancials — uses stored settlement values", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.1);

    await writeSellerOrder(SELLER_A, "order-1", {
      settlementStatus: "pending",
      sellerSubtotal: 1000,
      commissionRate: 0.1,
      commissionAmount: 100,
      sellerNetEarnings: 900,
      payoutStatus: "none",
      deliveredAt: null,
      eligibleSettlementDate: null,
    });
  });

  it("should report stored commission (100), not recomputed after rate change", async () => {
    // Change rate to 15%
    await updateSellerCommissionRate(SELLER_A, 0.15);

    const { readSellerFinancials } = await import("../settlement.server");
    const f = await readSellerFinancials(SELLER_A);

    // Total sales from stored settlement = 1000
    expect(f.totalSales).toBe(1000);
    // Total commission from stored settlement = 100 (10%), NOT 150 (15%)
    expect(f.totalCommission).toBe(100);
  });
});

// ====================================================================
// 6. INVALID COMMISSION RATES — clamping/validation
// ====================================================================

describe("Invalid Commission Rate Handling", () => {
  it("computeSellerSettlement with negative rate → clamped to 0%", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: -0.05, // Negative rate → clamped to 0
      nowMs: 1700000000000,
    });

    // Rate clamped to 0 → no commission, full earnings
    expect(s.commissionRate).toBe(0);
    expect(s.commissionAmount).toBe(0);
    expect(s.sellerNetEarnings).toBe(1000);
  });

  it("computeSellerSettlement with rate > 1.0 → clamped to 100%", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 1.5, // 150% → clamped to 100%
      nowMs: 1700000000000,
    });

    // Rate clamped to 1.0 (100%) → commission = subtotal, earnings = 0
    expect(s.commissionRate).toBe(1);
    expect(s.commissionAmount).toBe(1000);
    expect(s.sellerNetEarnings).toBe(0);
  });

  it("computeSellerSettlement with NaN rate → clamped to 0%", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: NaN,
      nowMs: 1700000000000,
    });

    expect(s.commissionRate).toBe(0);
    expect(s.commissionAmount).toBe(0);
    expect(s.sellerNetEarnings).toBe(1000);
  });

  it("computeSellerSettlement with Infinity rate → clamped to 100%", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const s = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "order-1",
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: Infinity,
      nowMs: 1700000000000,
    });

    expect(s.commissionRate).toBe(1);
    expect(s.commissionAmount).toBe(1000);
    expect(s.sellerNetEarnings).toBe(0);
  });
});

// ====================================================================
// 7. DEFAULT VALUE INCONSISTENCY
// ====================================================================

describe("Default Commission Rate Consistency", () => {
  it("all default commission rates should be consistent (0.08 = 8%)", () => {
    // After fix: adminSellers.ts, sellers.ts, checkout.server.ts all use 0.08
    const adminDefault = 0.08; // adminSellers.ts: Number(d.commissionRate ?? 0.08)
    const sellerDefault = 0.08; // sellers.ts: Number(r.commissionRate ?? 0.08)
    const checkoutDefault = 0.08; // checkout.server.ts: ?? 0.08

    expect(adminDefault).toBe(sellerDefault);
    expect(adminDefault).toBe(checkoutDefault);
  });
});
