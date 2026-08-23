/**
 * Settlement Financial Flow E2E Tests
 *
 * Tests the complete chain: Order → Settlement → Earnings → Wallet → Settlements
 *
 * Strategy:
 * - Pure function tests for computeSellerSettlement (no Firestore needed)
 * - Integration tests using the Firestore emulator for server functions
 * - Seller isolation tests (seller A cannot access seller B data)
 * - Idempotency tests (duplicate processing does not double-credit)
 * - Reversal tests (cancelled/refunded orders)
 * - Wallet balance consistency tests
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
const EMULATOR_PORT = 8082;

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

// Helper: convert Map to array of decoded docs
function mapToArray(m: Map<string, Record<string, unknown>>): Array<Record<string, unknown>> {
  return Array.from(m.values());
}

// ---- Test helpers ----

const SELLER_A = "seller-a-uid";
const SELLER_B = "seller-b-uid";
const ORDER_1 = "order-001";
const ORDER_2 = "order-002";

/** Write a seller profile doc to the emulator */
async function writeSellerProfile(sellerId: string, commissionRate = 0.08) {
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

/** Write a seller order with settlement data to the emulator */
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

  // Build settlement as a nested mapValue
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

/** Write a walletTx to the emulator */
async function writeWalletTx(
  sellerId: string,
  txId: string,
  type: string,
  amount: number,
  status = "completed",
  orderId: string | null = null,
) {
  const fields: Record<string, unknown> = {
    type: { stringValue: type },
    amount: Number.isInteger(amount) ? { integerValue: String(amount) } : { doubleValue: amount },
    status: { stringValue: status },
    note: { stringValue: `Test ${type}` },
    createdAt: { integerValue: String(Date.now()) },
  };
  if (orderId) fields.orderId = { stringValue: orderId };
  else fields.orderId = { nullValue: null };

  const res = await fetch(
    `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/sellers/${sellerId}/walletTx/${txId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields }),
    },
  );
  return res.ok;
}

// ====================================================================
// 1. SETTLEMENT COMPUTATION (Pure Function Tests)
// ====================================================================

describe("computeSellerSettlement — Order → Earnings", () => {
  it("should compute correct commission and seller earnings for single-seller order", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const settlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 100,
      orderShipping: 50,
      commissionRate: 0.08,
      nowMs: 1700000000000,
    });

    // Pro-rata: seller gets 100% (single seller)
    // discountShare = 100, shippingShare = 50
    // netSubtotal = 1000 - 100 + 50 = 950
    // commission = 1000 * 0.08 = 80
    // netEarnings = 950 - 80 = 870
    expect(settlement.sellerSubtotal).toBe(1000);
    expect(settlement.sellerDiscountShare).toBe(100);
    expect(settlement.sellerShippingShare).toBe(50);
    expect(settlement.sellerNetSubtotal).toBe(950);
    expect(settlement.commissionAmount).toBe(80);
    expect(settlement.sellerNetEarnings).toBe(870);
    expect(settlement.settlementStatus).toBe("pending");
    expect(settlement.payoutStatus).toBe("none");
  });

  it("should compute pro-rata discount/shipping for multi-seller order", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    // Seller A: 700 of 1000 subtotal, Seller B: 300 of 1000 subtotal
    const settlementA = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 700,
      orderSubtotal: 1000,
      orderDiscount: 200,
      orderShipping: 100,
      commissionRate: 0.08,
      nowMs: 1700000000000,
    });

    // ratio = 0.7, discountShare = 140, shippingShare = 70
    // netSubtotal = 700 - 140 + 70 = 630, commission = 56, earnings = 574
    expect(settlementA.sellerDiscountShare).toBe(140);
    expect(settlementA.sellerShippingShare).toBe(70);
    expect(settlementA.sellerNetSubtotal).toBe(630);
    expect(settlementA.commissionAmount).toBe(56);
    expect(settlementA.sellerNetEarnings).toBe(574);

    const settlementB = computeSellerSettlement({
      sellerId: SELLER_B,
      orderId: ORDER_1,
      sellerSubtotal: 300,
      orderSubtotal: 1000,
      orderDiscount: 200,
      orderShipping: 100,
      commissionRate: 0.1,
      nowMs: 1700000000000,
    });

    // ratio = 0.3, discountShare = 60, shippingShare = 30
    // netSubtotal = 300 - 60 + 30 = 270, commission = 30, earnings = 240
    expect(settlementB.sellerDiscountShare).toBe(60);
    expect(settlementB.sellerShippingShare).toBe(30);
    expect(settlementB.sellerNetSubtotal).toBe(270);
    expect(settlementB.commissionAmount).toBe(30);
    expect(settlementB.sellerNetEarnings).toBe(240);
  });

  it("should handle zero discount and zero shipping", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const settlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 500,
      orderSubtotal: 500,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.08,
      nowMs: 1700000000000,
    });

    expect(settlement.sellerDiscountShare).toBe(0);
    expect(settlement.sellerShippingShare).toBe(0);
    expect(settlement.sellerNetSubtotal).toBe(500);
    expect(settlement.commissionAmount).toBe(40);
    expect(settlement.sellerNetEarnings).toBe(460);
  });

  it("should use seller-specific commission rate, not global default", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const settlementA = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.05,
      nowMs: 1700000000000,
    });

    const settlementB = computeSellerSettlement({
      sellerId: SELLER_B,
      orderId: ORDER_2,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.15,
      nowMs: 1700000000000,
    });

    expect(settlementA.commissionAmount).toBe(50);
    expect(settlementB.commissionAmount).toBe(150);
    expect(settlementA.sellerNetEarnings).toBe(950);
    expect(settlementB.sellerNetEarnings).toBe(850);
  });

  it("should handle zero subtotal gracefully (no division by zero)", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const settlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 0,
      orderSubtotal: 0,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.08,
      nowMs: 1700000000000,
    });

    expect(settlement.sellerSubtotal).toBe(0);
    expect(settlement.sellerNetEarnings).toBe(0);
  });
});

// ====================================================================
// 2. SETTLEMENT STATUS TRANSITIONS (Idempotency)
// ====================================================================

describe("Settlement Status Transitions — Idempotency", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.08);
  });

  it("should transition pending → hold when order is delivered", async () => {
    const { markOrderDeliveredSettlement } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "pending",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: null,
      eligibleSettlementDate: null,
    });

    const result = await markOrderDeliveredSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      deliveredAt: Date.now(),
    });

    expect(result.updated).toBe(true);
    expect(result.eligibleDate).not.toBeNull();
  });

  it("should be idempotent — calling markDelivered twice does not double-update", async () => {
    const { markOrderDeliveredSettlement } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "pending",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: null,
      eligibleSettlementDate: null,
    });

    const result1 = await markOrderDeliveredSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      deliveredAt: Date.now(),
    });
    expect(result1.updated).toBe(true);

    const result2 = await markOrderDeliveredSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      deliveredAt: Date.now(),
    });
    expect(result2.updated).toBe(false);
  });

  it("should not transition from available back to hold", async () => {
    const { markOrderDeliveredSettlement } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "available",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      eligibleSettlementDate: Date.now() - 1 * 24 * 60 * 60 * 1000,
    });

    const result = await markOrderDeliveredSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      deliveredAt: Date.now(),
    });
    expect(result.updated).toBe(false);
  });
});

// ====================================================================
// 3. EARNINGS RELEASE (hold → available + walletTx credit)
// ====================================================================

describe("Earnings Release — hold → available", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.08);
  });

  it("should not release earnings if hold period has not passed", async () => {
    const { releaseSettlementIfEligible } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "hold",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      eligibleSettlementDate: Date.now() + 4 * 24 * 60 * 60 * 1000,
    });

    const result = await releaseSettlementIfEligible({
      sellerId: SELLER_A,
      orderId: ORDER_1,
    });

    expect(result.released).toBe(false);
    expect(result.amount).toBeNull();
  });

  it("should be idempotent — releasing twice does not double-credit wallet", async () => {
    const { releaseSettlementIfEligible } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "hold",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
      eligibleSettlementDate: Date.now() - 3 * 24 * 60 * 60 * 1000,
    });

    const result1 = await releaseSettlementIfEligible({
      sellerId: SELLER_A,
      orderId: ORDER_1,
    });
    expect(result1.released).toBe(true);
    expect(result1.amount).toBe(920);

    const walletDocs = await listEmulatorDocs(`sellers/${SELLER_A}/walletTx`);
    expect(mapToArray(walletDocs).length).toBe(1);

    const result2 = await releaseSettlementIfEligible({
      sellerId: SELLER_A,
      orderId: ORDER_1,
    });
    expect(result2.released).toBe(false);

    const walletDocs2 = await listEmulatorDocs(`sellers/${SELLER_A}/walletTx`);
    expect(mapToArray(walletDocs2).length).toBe(1);
  });

  it("should not release from pending status (only from hold)", async () => {
    const { releaseSettlementIfEligible } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "pending",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: null,
      eligibleSettlementDate: null,
    });

    const result = await releaseSettlementIfEligible({
      sellerId: SELLER_A,
      orderId: ORDER_1,
    });
    expect(result.released).toBe(false);
  });
});

// ====================================================================
// 4. SELLER ISOLATION (cross-seller data access prevention)
// ====================================================================

describe("Seller Isolation — No Cross-Seller Data Leaks", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.08);
    await writeSellerProfile(SELLER_B, 0.1);
  });

  it("Seller A financials should not include Seller B data", async () => {
    const { readSellerFinancials } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "pending",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: null,
      eligibleSettlementDate: null,
    });

    await writeSellerOrder(SELLER_B, ORDER_2, {
      settlementStatus: "pending",
      sellerSubtotal: 2000,
      commissionRate: 0.1,
      commissionAmount: 200,
      sellerNetEarnings: 1800,
      payoutStatus: "none",
      deliveredAt: null,
      eligibleSettlementDate: null,
    });

    const financialsA = await readSellerFinancials(SELLER_A);
    const financialsB = await readSellerFinancials(SELLER_B);

    expect(financialsA.totalSales).toBe(1000);
    expect(financialsA.totalCommission).toBe(80);
    expect(financialsB.totalSales).toBe(2000);
    expect(financialsB.totalCommission).toBe(200);
  });

  it("Seller A wallet balance should not include Seller B earnings", async () => {
    await writeWalletTx(SELLER_A, "tx-a-1", "earning", 920, "completed", ORDER_1);
    await writeWalletTx(SELLER_B, "tx-b-1", "earning", 1800, "completed", ORDER_2);

    const { readSellerFinancials } = await import("../settlement.server");

    const financialsA = await readSellerFinancials(SELLER_A);
    const financialsB = await readSellerFinancials(SELLER_B);

    expect(financialsA.availableBalance).toBe(920);
    expect(financialsB.availableBalance).toBe(1800);
  });

  it("Withdrawal by Seller A should not affect Seller B balance", async () => {
    await writeWalletTx(SELLER_A, "tx-a-1", "earning", 1000, "completed", ORDER_1);
    await writeWalletTx(SELLER_B, "tx-b-1", "earning", 1000, "completed", ORDER_2);

    const { requestSettlementWithdrawal } = await import("../settlement.server");

    await requestSettlementWithdrawal({
      uid: SELLER_A,
      amount: 500,
      method: "bkash",
      destination: "01712345678",
    });

    const { readSellerFinancials } = await import("../settlement.server");

    const financialsA = await readSellerFinancials(SELLER_A);
    const financialsB = await readSellerFinancials(SELLER_B);

    expect(financialsA.availableBalance).toBe(500);
    expect(financialsB.availableBalance).toBe(1000);
  });
});

// ====================================================================
// 5. WALLET BALANCE CONSISTENCY
// ====================================================================

describe("Wallet Balance Consistency", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.08);
  });

  it("should count completed earning as positive balance", async () => {
    await writeWalletTx(SELLER_A, "tx-1", "earning", 500, "completed");
    const { readSellerFinancials } = await import("../settlement.server");
    const f = await readSellerFinancials(SELLER_A);
    expect(f.availableBalance).toBe(500);
  });

  it("should count pending withdrawal as negative (reduces available)", async () => {
    await writeWalletTx(SELLER_A, "tx-1", "earning", 1000, "completed");
    await writeWalletTx(SELLER_A, "tx-2", "withdrawal", -300, "pending");
    const { readSellerFinancials } = await import("../settlement.server");
    const f = await readSellerFinancials(SELLER_A);
    expect(f.availableBalance).toBe(700);
  });

  it("should count completed withdrawal as negative", async () => {
    await writeWalletTx(SELLER_A, "tx-1", "earning", 1000, "completed");
    await writeWalletTx(SELLER_A, "tx-2", "withdrawal", -300, "completed");
    const { readSellerFinancials } = await import("../settlement.server");
    const f = await readSellerFinancials(SELLER_A);
    expect(f.availableBalance).toBe(700);
  });

  it("should correctly sum multiple transactions", async () => {
    await writeWalletTx(SELLER_A, "tx-1", "earning", 500, "completed");
    await writeWalletTx(SELLER_A, "tx-2", "earning", 300, "completed");
    await writeWalletTx(SELLER_A, "tx-3", "withdrawal", -200, "completed");
    await writeWalletTx(SELLER_A, "tx-4", "withdrawal", -100, "pending");
    const { readSellerFinancials } = await import("../settlement.server");
    const f = await readSellerFinancials(SELLER_A);
    // 500 + 300 - 200 - 100 = 500
    expect(f.availableBalance).toBe(500);
  });
});

// ====================================================================
// 6. WITHDRAWAL PROCESSING
// ====================================================================

describe("Withdrawal Request", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.08);
    await writeWalletTx(SELLER_A, "tx-1", "earning", 1000, "completed", ORDER_1);
  });

  it("should reject withdrawal exceeding available balance", async () => {
    const { requestSettlementWithdrawal } = await import("../settlement.server");

    await expect(
      requestSettlementWithdrawal({
        uid: SELLER_A,
        amount: 2000,
        method: "bkash",
        destination: "01712345678",
      }),
    ).rejects.toThrow();
  });

  it("should reject withdrawal below minimum amount", async () => {
    const { requestSettlementWithdrawal } = await import("../settlement.server");

    await expect(
      requestSettlementWithdrawal({
        uid: SELLER_A,
        amount: 5,
        method: "bkash",
        destination: "01712345678",
      }),
    ).rejects.toThrow();
  });

  it("should create pending walletTx and withdrawal record", async () => {
    const { requestSettlementWithdrawal } = await import("../settlement.server");

    const result = await requestSettlementWithdrawal({
      uid: SELLER_A,
      amount: 500,
      method: "bkash",
      destination: "01712345678",
    });

    expect(result.withdrawalId).toBeTruthy();
    expect(result.remainingBalance).toBe(500);

    const withdrawalDoc = await getEmulatorDoc(
      `sellers/${SELLER_A}/withdrawals/${result.withdrawalId}`,
    );
    expect(withdrawalDoc).toBeTruthy();
    expect(withdrawalDoc!.status).toBe("pending");

    const walletDocs = await listEmulatorDocs(`sellers/${SELLER_A}/walletTx`);
    const pendingTx = mapToArray(walletDocs).find((d) => {
      const status = String(d.status ?? "completed");
      return status === "pending";
    });
    expect(pendingTx).toBeTruthy();
  });

  it("should mask payout destination for security", async () => {
    const { requestSettlementWithdrawal } = await import("../settlement.server");

    const result = await requestSettlementWithdrawal({
      uid: SELLER_A,
      amount: 100,
      method: "bkash",
      destination: "01712345678",
    });

    const withdrawalDoc = await getEmulatorDoc(
      `sellers/${SELLER_A}/withdrawals/${result.withdrawalId}`,
    );
    const dest = String(withdrawalDoc!.destination ?? "");
    expect(dest).not.toBe("01712345678");
    expect(dest).toContain("*");
  });
});

// ====================================================================
// 7. REVERSAL (cancelled/refunded orders)
// ====================================================================

describe("Settlement Reversal", () => {
  beforeEach(async () => {
    await writeSellerProfile(SELLER_A, 0.08);
  });

  it("should reverse from pending status without wallet impact", async () => {
    const { reverseSellerSettlement } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "pending",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: null,
      eligibleSettlementDate: null,
    });

    const result = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      reason: "Order cancelled by customer",
      adminUid: "admin-uid",
    });

    expect(result.reversed).toBe(true);
    expect(result.walletImpact).toBe(0);
  });

  it("should reverse from hold status without wallet impact", async () => {
    const { reverseSellerSettlement } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "hold",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      eligibleSettlementDate: Date.now() + 4 * 24 * 60 * 60 * 1000,
    });

    const result = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      reason: "Customer cancelled before delivery",
      adminUid: "admin-uid",
    });

    expect(result.reversed).toBe(true);
    expect(result.walletImpact).toBe(0);
  });

  it("should reverse from available status WITH wallet debit", async () => {
    const { reverseSellerSettlement } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "available",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
      eligibleSettlementDate: Date.now() - 3 * 24 * 60 * 60 * 1000,
    });
    await writeWalletTx(SELLER_A, "tx-1", "earning", 920, "completed", ORDER_1);

    const result = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      reason: "Refund issued to customer",
      adminUid: "admin-uid",
    });

    expect(result.reversed).toBe(true);
    expect(result.walletImpact).toBe(-920);

    const walletDocs = await listEmulatorDocs(`sellers/${SELLER_A}/walletTx`);
    const refundTx = mapToArray(walletDocs).find((d) => {
      const type = String(d.type ?? "");
      return type === "refund";
    });
    expect(refundTx).toBeTruthy();
  });

  it("should be idempotent — reversing twice does not double-debit", async () => {
    const { reverseSellerSettlement } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "available",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "none",
      deliveredAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
      eligibleSettlementDate: Date.now() - 3 * 24 * 60 * 60 * 1000,
    });
    await writeWalletTx(SELLER_A, "tx-1", "earning", 920, "completed", ORDER_1);

    const result1 = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      reason: "Refund",
      adminUid: "admin-uid",
    });
    expect(result1.reversed).toBe(true);

    const result2 = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      reason: "Refund again",
      adminUid: "admin-uid",
    });
    expect(result2.reversed).toBe(false);
    expect(result2.walletImpact).toBe(0);
  });

  it("should throw when trying to reverse a paid settlement", async () => {
    const { reverseSellerSettlement } = await import("../settlement.server");

    await writeSellerOrder(SELLER_A, ORDER_1, {
      settlementStatus: "paid",
      sellerSubtotal: 1000,
      commissionRate: 0.08,
      commissionAmount: 80,
      sellerNetEarnings: 920,
      payoutStatus: "paid",
      deliveredAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      eligibleSettlementDate: Date.now() - 23 * 24 * 60 * 60 * 1000,
    });

    await expect(
      reverseSellerSettlement({
        sellerId: SELLER_A,
        orderId: ORDER_1,
        reason: "Attempt to reverse paid",
        adminUid: "admin-uid",
      }),
    ).rejects.toThrow();
  });
});

// ====================================================================
// 8. AUTHENTICATION VERIFICATION
// ====================================================================

describe("Authentication — Server Functions Verify ID Token", () => {
  it("should reject empty idToken in getSellerFinancials", async () => {
    const { getSellerFinancials } = await import("../settlement.functions");

    await expect(getSellerFinancials({ data: { idToken: "" } })).rejects.toThrow();
  });

  it("should reject empty idToken in releaseSettlements", async () => {
    const { releaseSettlements } = await import("../settlement.functions");

    await expect(releaseSettlements({ data: { idToken: "" } })).rejects.toThrow();
  });

  it("should reject empty idToken in withdrawal request", async () => {
    const { requestSettlementWithdrawal } = await import("../settlement.functions");

    await expect(
      requestSettlementWithdrawal({
        data: { idToken: "", amount: 100, method: "bkash", destination: "01712345678" },
      }),
    ).rejects.toThrow();
  });
});
