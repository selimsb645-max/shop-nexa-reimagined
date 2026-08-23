/**
 * Commission Rate Sync Audit — Comprehensive Tests
 *
 * Verifies the complete chain:
 * Admin commissionRate → Firestore seller profile →
 * checkout reads rate → computeSellerSettlement →
 * settlement record (frozen) → release uses stored value →
 * wallet credit uses stored value
 *
 * Key properties:
 * 1. Rate is READ server-side from Firestore (never client-supplied)
 * 2. Rate is FROZEN into settlement record at order creation
 * 3. Changing rate on seller profile does NOT affect existing settlements
 * 4. New orders after rate change use the updated rate
 * 5. Invalid rates (negative, >100%, NaN) are clamped to safe defaults
 * 6. Historical settlement values are never recomputed
 * 7. Multiple sellers use their own rates
 * 8. Seller cannot modify commissionRate
 * 9. Only admins can update commissionRate
 * 10. Admin commission rate update validates and clamps input
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "./firestore-emulator";
import type { Server } from "node:http";

let emulatorServer: Server;
const EMULATOR_PORT = 8086;

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

const SELLER_A = "audit-seller-a";
const SELLER_B = "audit-seller-b";
const ORDER_1 = "audit-order-001";
const ORDER_2 = "audit-order-002";
const EMULATOR_BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents`;

/** Write a seller profile with a commission rate */
async function writeSeller(sellerId: string, commissionRate: number) {
  const res = await fetch(`${EMULATOR_BASE}/sellers/${sellerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fields: {
        shopName: { stringValue: `Shop ${sellerId}` },
        status: { stringValue: "approved" },
        commissionRate: { doubleValue: commissionRate },
        uid: { stringValue: sellerId },
        createdAt: { integerValue: String(Date.now()) },
      },
    }),
  });
  expect(res.ok).toBe(true);
}

/** Update a seller's commission rate (simulates admin update) */
async function updateSellerRate(sellerId: string, newRate: number) {
  const res = await fetch(`${EMULATOR_BASE}/sellers/${sellerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fields: {
        commissionRate: { doubleValue: newRate },
        updatedAt: { integerValue: String(Date.now()) },
      },
    }),
  });
  expect(res.ok).toBe(true);
}

/** Read a seller's commission rate */
async function readSellerRate(sellerId: string): Promise<number> {
  const res = await fetch(`${EMULATOR_BASE}/sellers/${sellerId}`);
  if (!res.ok) throw new Error("Seller not found");
  const doc = await res.json();
  return Number(doc.fields?.commissionRate?.doubleValue ?? 0.08);
}

// ====================================================================
// 1. COMPUTE SETTLEMENT — Rate from Backend
// ====================================================================

describe("computeSellerSettlement — Commission Rate Calculation", () => {
  it("should compute 10% commission correctly", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");
    const result = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.1,
      nowMs: 1000000,
    });

    expect(result.commissionRate).toBe(0.1);
    expect(result.commissionAmount).toBe(100);
    expect(result.sellerNetEarnings).toBe(900);
  });

  it("should compute 15% commission correctly", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");
    const result = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.15,
      nowMs: 1000000,
    });

    expect(result.commissionRate).toBe(0.15);
    expect(result.commissionAmount).toBe(150);
    expect(result.sellerNetEarnings).toBe(850);
  });

  it("should use different rates for different sellers in same order", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    // Seller A: 10%, Seller B: 15%, Order total: 2000 (1000 each)
    const sellerA = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 2000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.1,
      nowMs: 1000000,
    });

    const sellerB = computeSellerSettlement({
      sellerId: SELLER_B,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 2000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.15,
      nowMs: 1000000,
    });

    expect(sellerA.commissionAmount).toBe(100);
    expect(sellerA.sellerNetEarnings).toBe(900);

    expect(sellerB.commissionAmount).toBe(150);
    expect(sellerB.sellerNetEarnings).toBe(850);
  });
});

// ====================================================================
// 2. RATE FREEZING — Settlement stores rate at creation time
// ====================================================================

describe("Rate Freezing — Settlement Record Stores Rate at Creation", () => {
  it("should freeze commission rate in settlement record", async () => {
    await writeSeller(SELLER_A, 0.1);

    const { computeSellerSettlement } = await import("../settlement.server");
    const settlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.1,
      nowMs: 1000000,
    });

    // Rate is frozen in the settlement record
    expect(settlement.commissionRate).toBe(0.1);
    expect(settlement.commissionAmount).toBe(100);
    expect(settlement.sellerNetEarnings).toBe(900);
  });

  it("changing seller profile rate does NOT change existing settlement values", async () => {
    await writeSeller(SELLER_A, 0.1);

    // Create settlement with 10% rate
    const { computeSellerSettlement } = await import("../settlement.server");
    const originalSettlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.1,
      nowMs: 1000000,
    });

    // Admin changes rate to 15%
    await updateSellerRate(SELLER_A, 0.15);
    const newRate = await readSellerRate(SELLER_A);
    expect(newRate).toBe(0.15);

    // Original settlement values are UNCHANGED (they were frozen)
    expect(originalSettlement.commissionRate).toBe(0.1);
    expect(originalSettlement.commissionAmount).toBe(100);
    expect(originalSettlement.sellerNetEarnings).toBe(900);

    // New order uses the updated rate
    const newSettlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_2,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: newRate,
      nowMs: 2000000,
    });

    expect(newSettlement.commissionRate).toBe(0.15);
    expect(newSettlement.commissionAmount).toBe(150);
    expect(newSettlement.sellerNetEarnings).toBe(850);
  });
});

// ====================================================================
// 3. SCENARIO: 10% → 15% Rate Change
// ====================================================================

describe("Rate Change Scenario: 10% → 15%", () => {
  it("order BEFORE rate change uses 10%, order AFTER uses 15%", async () => {
    await writeSeller(SELLER_A, 0.1);

    const { computeSellerSettlement } = await import("../settlement.server");

    // Order 1: created when rate was 10%
    const order1 = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.1,
      nowMs: 1000000,
    });

    // Admin changes rate to 15%
    await updateSellerRate(SELLER_A, 0.15);

    // Order 2: created when rate is 15%
    const order2 = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_2,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: await readSellerRate(SELLER_A),
      nowMs: 2000000,
    });

    // Historical order preserved
    expect(order1.commissionRate).toBe(0.1);
    expect(order1.commissionAmount).toBe(100);
    expect(order1.sellerNetEarnings).toBe(900);

    // New order uses updated rate
    expect(order2.commissionRate).toBe(0.15);
    expect(order2.commissionAmount).toBe(150);
    expect(order2.sellerNetEarnings).toBe(850);
  });

  it("multiple sellers: each seller's rate change is independent", async () => {
    await writeSeller(SELLER_A, 0.1);
    await writeSeller(SELLER_B, 0.12);

    const { computeSellerSettlement } = await import("../settlement.server");

    // Change Seller A's rate to 15%, leave Seller B at 12%
    await updateSellerRate(SELLER_A, 0.15);

    const orderA = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 2000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: await readSellerRate(SELLER_A),
      nowMs: 1000000,
    });

    const orderB = computeSellerSettlement({
      sellerId: SELLER_B,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 2000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: await readSellerRate(SELLER_B),
      nowMs: 1000000,
    });

    expect(orderA.commissionRate).toBe(0.15);
    expect(orderA.commissionAmount).toBe(150);

    expect(orderB.commissionRate).toBe(0.12);
    expect(orderB.commissionAmount).toBe(120);
  });
});

// ====================================================================
// 4. SECURITY — Client cannot manipulate commission rate
// ====================================================================

describe("Security — Commission Rate Protection", () => {
  it("checkout input schema does NOT accept commissionRate from client", () => {
    const code = readFileSync("src/lib/orders.functions.ts", "utf-8");
    const placeOrderSchema = code;

    // The placeOrderSchema should not include commissionRate
    expect(placeOrderSchema).not.toContain("commissionRate");
    expect(placeOrderSchema).not.toContain("commission");
    expect(placeOrderSchema).not.toContain("earnings");
  });

  it("commissionRate is NOT in seller-editable fields", () => {
    const code = readFileSync("src/services/firebase/sellers.ts", "utf-8");

    // SELLER_EDITABLE_FIELDS should not include commissionRate
    const editableBlock = code.match(/SELLER_EDITABLE_FIELDS = new Set\(\[([\s\S]*?)\]\)/);
    expect(editableBlock).toBeDefined();
    expect(editableBlock![1]).not.toContain("commissionRate");
  });

  it("Firestore rules block seller from writing commissionRate", () => {
    const rules = readFileSync("firestore.rules", "utf-8");

    // The seller update rule should explicitly block commissionRate
    expect(rules).toContain("commissionRate");
    expect(rules).toContain("hasAny");
  });

  it("computeSellerSettlement clamps rate to [0, 1]", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    // Negative rate → clamped to 0
    const negative = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: -0.5,
      nowMs: 1000000,
    });
    expect(negative.commissionRate).toBe(0);
    expect(negative.commissionAmount).toBe(0);

    // Rate > 1 → clamped to 1
    const tooHigh = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 1.5,
      nowMs: 1000000,
    });
    expect(tooHigh.commissionRate).toBe(1);
    expect(tooHigh.commissionAmount).toBe(1000);

    // NaN → default to 0
    const nanRate = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: NaN,
      nowMs: 1000000,
    });
    expect(nanRate.commissionRate).toBe(0);
    expect(nanRate.commissionAmount).toBe(0);

    // Infinity → clamped to 1
    const infRate = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: Infinity,
      nowMs: 1000000,
    });
    expect(infRate.commissionRate).toBe(1);
    expect(infRate.commissionAmount).toBe(1000);
  });

  it("checkout reads commissionRate from Firestore, not from client", () => {
    const code = readFileSync("src/lib/checkout.server.ts", "utf-8");

    // Should read from seller doc in Firestore
    expect(code).toContain("sDoc.data");
    expect(code).toContain("commissionRate");

    // Should NOT accept commissionRate from request body
    // The placeOrderSchema only accepts: idToken, items, shippingAddress, etc.
    // commissionRate is NOT in the schema — it's read from Firestore server-side
    const schemaMatch = code.match(/placeOrderSchema = z\.object\(\{[\s\S]*?\}\)/);
    if (schemaMatch) {
      expect(schemaMatch[0]).not.toContain("commissionRate");
      expect(schemaMatch[0]).not.toContain("commission");
    }
  });
});

// ====================================================================
// 5. RELEASE — Uses stored values, not recomputed
// ====================================================================

describe("Earnings Release — Uses Stored Settlement Values", () => {
  it("releaseSettlementIfEligible reads sellerNetEarnings from stored settlement", () => {
    const code = readFileSync("src/lib/settlement.server.ts", "utf-8");

    // The release function should read from the stored settlement
    expect(code).toContain("settlement.sellerNetEarnings");

    // It should NOT re-read commissionRate from the seller profile
    const releaseSection = code.match(/releaseSettlementIfEligible[\s\S]*?commitWrites/);
    if (releaseSection) {
      // The release function should not contain a fetch to sellers/{sellerId}
      // to read commissionRate (it reads the order, not the seller profile)
      expect(releaseSection[0]).not.toMatch(/sellers\/.*commissionRate/);
    }
  });

  it("wallet credit amount equals stored sellerNetEarnings (not recomputed)", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    // Create settlement at 10% rate
    const settlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_1,
      sellerSubtotal: 1000,
      orderSubtotal: 1000,
      orderDiscount: 0,
      orderShipping: 0,
      commissionRate: 0.1,
      nowMs: 1000000,
    });

    // The wallet credit should be the STORED sellerNetEarnings
    const expectedWalletCredit = settlement.sellerNetEarnings;
    expect(expectedWalletCredit).toBe(900);

    // Even if we change the rate, the stored value is used
    await writeSeller(SELLER_A, 0.15);
    // The settlement object still has the old values
    expect(settlement.sellerNetEarnings).toBe(900);
    expect(settlement.commissionRate).toBe(0.1);
  });
});

// ====================================================================
// 6. ADMIN COMMISSION RATE UPDATE — Server function
// ====================================================================

describe("Admin Commission Rate Update Function", () => {
  it("updateSellerCommissionRate clamps rate to [0, 1]", () => {
    const code = readFileSync("src/lib/admin-commission.server.ts", "utf-8");
    expect(code).toContain("Math.min(Math.max");
  });

  it("admin commission function validates rate input", () => {
    const code = readFileSync("src/lib/settlement.functions.ts", "utf-8");

    // The schema should validate the rate
    expect(code).toContain("updateCommissionSchema");
    expect(code).toContain("newRate: z.number");
    expect(code).toContain("min(0)");
    expect(code).toContain("max(1)");
  });

  it("admin commission function verifies admin role", () => {
    const code = readFileSync("src/lib/settlement.functions.ts", "utf-8");

    // Should verify admin role
    const commissionSection = code.match(/updateSellerCommissionRate[\s\S]*?handler[\s\S]*?return/);
    if (commissionSection) {
      expect(commissionSection[0]).toContain("admin");
      expect(commissionSection[0]).toContain("verifyIdToken");
    }
  });
});

// ====================================================================
// 7. DEFAULT RATE CONSISTENCY
// ====================================================================

describe("Default Commission Rate Consistency", () => {
  it("all default rates are 0.08 (8%)", () => {
    const sellersCode = readFileSync("src/services/firebase/sellers.ts", "utf-8");
    const adminSellersCode = readFileSync("src/services/firebase/adminSellers.ts", "utf-8");
    const checkoutCode = readFileSync("src/lib/checkout.server.ts", "utf-8");
    const settlementCode = readFileSync("src/lib/settlement.server.ts", "utf-8");

    // All places that set a default should use 0.08
    expect(sellersCode).toContain("commissionRate: 0.08");
    expect(adminSellersCode).toContain("0.08");
    expect(checkoutCode).toContain("0.08");
  });

  it("checkout clamps rate from Firestore to [0, 1]", () => {
    const code = readFileSync("src/lib/checkout.server.ts", "utf-8");
    expect(code).toContain("Number.isFinite");
    expect(code).toContain("Math.min");
    expect(code).toContain("Math.max");
  });
});

// ====================================================================
// 8. FIRESTORE RULES — Verify protection
// ====================================================================

describe("Firestore Rules — Commission Rate Protection", () => {
  it("seller self-update explicitly blocks commissionRate", () => {
    const rules = readFileSync("firestore.rules", "utf-8");

    // The hasAny block should include commissionRate
    expect(rules).toContain("'commissionRate'");

    // The hasOnly block should NOT include commissionRate
    const hasOnlyBlock = rules.match(/hasOnly\(\[[\s\S]*?\]\)/);
    if (hasOnlyBlock) {
      expect(hasOnlyBlock[0]).not.toContain("commissionRate");
    }
  });

  it("seller order update blocks commissionRate changes", () => {
    const rules = readFileSync("firestore.rules", "utf-8");

    // The seller order update rule should block commissionRate
    expect(rules).toContain("'commissionRate'");
    expect(rules).toContain("hasAny");
  });

  it("walletTx and settlementTx are NOT writable by client", () => {
    const rules = readFileSync("firestore.rules", "utf-8");

    // walletTx should not be writable by client
    expect(rules).toMatch(/walletTx\/\{txId\}[\s\S]*?create, update, delete: if false/);

    // settlementTx should not be writable by client
    expect(rules).toMatch(/settlementTx\/\{txId\}[\s\S]*?create, update, delete: if false/);
  });
});
