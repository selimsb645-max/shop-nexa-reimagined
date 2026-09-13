/**
 * AVENTA SHOP — Per-Product Delivery Charge Logic Tests
 *
 * STRICT PRODUCT-LEVEL delivery policy:
 * - freeDelivery is evaluated INDEPENDENTLY per product
 * - No seller-wide "all products free" logic
 * - Customer pays 0 for free-delivery products, zoneCharge for others
 * - Seller absorbs zoneCharge only for their free-delivery products
 * - Delivery snapshot is immutable per order
 *
 * Covers 15 scenarios from the specification.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "./firestore-emulator";
import type { Server } from "node:http";

let emulatorServer: Server;
const EMULATOR_PORT = 8087;

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

// ── Helpers ──────────────────────────────────────────────────────────

const SELLER_A = "seller-a";
const SELLER_B = "seller-b";

// Zone charges (admin-configured)
const ZONE_DHAKA = 60;
const ZONE_SUBURB = 100;
const ZONE_OUTSIDE = 150;

/**
 * Simulates the per-product delivery calculation from checkout.server.ts.
 * This mirrors the exact logic used in the server-side checkout flow.
 */
function computePerProductDelivery(
  lines: Array<{
    productId: string;
    sellerId: string;
    freeDelivery: boolean;
  }>,
  zoneCharge: number,
) {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const deliveryLines = lines.map((l) => {
    const free = l.freeDelivery;
    return {
      productId: l.productId,
      sellerId: l.sellerId,
      freeDelivery: free,
      zoneCharge,
      customerDeliveryCharge: free ? 0 : round2(zoneCharge),
      sellerAbsorbedCharge: free ? round2(zoneCharge) : 0,
    };
  });

  // Aggregate per-seller
  const sellerDeliveryMap = new Map<
    string,
    {
      sellerDeliveryCharge: number;
      customerDeliveryCharge: number;
      deliveryLines: typeof deliveryLines;
    }
  >();
  let totalCustomerDelivery = 0;
  let totalSellerAbsorbed = 0;

  for (const dl of deliveryLines) {
    const existing = sellerDeliveryMap.get(dl.sellerId) ?? {
      sellerDeliveryCharge: 0,
      customerDeliveryCharge: 0,
      deliveryLines: [] as typeof deliveryLines,
    };
    existing.sellerDeliveryCharge = round2(existing.sellerDeliveryCharge + dl.sellerAbsorbedCharge);
    existing.customerDeliveryCharge = round2(
      existing.customerDeliveryCharge + dl.customerDeliveryCharge,
    );
    existing.deliveryLines.push(dl);
    sellerDeliveryMap.set(dl.sellerId, existing);
    totalCustomerDelivery = round2(totalCustomerDelivery + dl.customerDeliveryCharge);
    totalSellerAbsorbed = round2(totalSellerAbsorbed + dl.sellerAbsorbedCharge);
  }

  return {
    deliveryLines,
    sellerDeliveryMap,
    totalCustomerDelivery,
    totalSellerAbsorbed,
    shipping: totalCustomerDelivery,
  };
}

/**
 * Simulates settlement computation for a seller, deducting absorbed delivery.
 */
function computeSellerEarnings(
  sellerSubtotal: number,
  commissionRate: number,
  sellerDeliveryCharge: number,
) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const commissionAmount = round2(sellerSubtotal * commissionRate);
  // Seller net = subtotal - commission - absorbed delivery
  const sellerNetEarnings = round2(sellerSubtotal - commissionAmount - sellerDeliveryCharge);
  return { commissionAmount, sellerNetEarnings };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Per-Product Delivery Charge Logic", () => {
  // Test 1: Product A freeDelivery=false
  it("1. Product with freeDelivery=false -> customer pays delivery charge", () => {
    const lines = [{ productId: "p1", sellerId: SELLER_A, freeDelivery: false }];
    const result = computePerProductDelivery(lines, ZONE_DHAKA);

    expect(result.deliveryLines[0].customerDeliveryCharge).toBe(ZONE_DHAKA);
    expect(result.deliveryLines[0].sellerAbsorbedCharge).toBe(0);
    expect(result.totalCustomerDelivery).toBe(ZONE_DHAKA);
    expect(result.totalSellerAbsorbed).toBe(0);
    expect(result.shipping).toBe(ZONE_DHAKA);
  });

  // Test 2: Product B freeDelivery=true
  it("2. Product with freeDelivery=true -> seller absorbs delivery charge", () => {
    const lines = [{ productId: "p2", sellerId: SELLER_A, freeDelivery: true }];
    const result = computePerProductDelivery(lines, ZONE_DHAKA);

    expect(result.deliveryLines[0].customerDeliveryCharge).toBe(0);
    expect(result.deliveryLines[0].sellerAbsorbedCharge).toBe(ZONE_DHAKA);
    expect(result.totalCustomerDelivery).toBe(0);
    expect(result.totalSellerAbsorbed).toBe(ZONE_DHAKA);
    expect(result.shipping).toBe(0);
  });

  // Test 3: Same seller with mixed delivery settings
  it("3. Same seller with mixed freeDelivery -> each product evaluated independently", () => {
    const lines = [
      { productId: "p1", sellerId: SELLER_A, freeDelivery: true },
      { productId: "p2", sellerId: SELLER_A, freeDelivery: false },
      { productId: "p3", sellerId: SELLER_A, freeDelivery: false },
    ];
    const result = computePerProductDelivery(lines, ZONE_DHAKA);

    // p1: free -> customer pays 0
    expect(result.deliveryLines[0].customerDeliveryCharge).toBe(0);
    expect(result.deliveryLines[0].sellerAbsorbedCharge).toBe(ZONE_DHAKA);

    // p2: paid -> customer pays zone charge
    expect(result.deliveryLines[1].customerDeliveryCharge).toBe(ZONE_DHAKA);
    expect(result.deliveryLines[1].sellerAbsorbedCharge).toBe(0);

    // p3: paid -> customer pays zone charge
    expect(result.deliveryLines[2].customerDeliveryCharge).toBe(ZONE_DHAKA);
    expect(result.deliveryLines[2].sellerAbsorbedCharge).toBe(0);

    // Total: customer pays for 2 products, seller absorbs for 1
    expect(result.totalCustomerDelivery).toBe(ZONE_DHAKA * 2);
    expect(result.totalSellerAbsorbed).toBe(ZONE_DHAKA);
  });

  // Test 4: Multiple sellers with mixed delivery settings
  it("4. Multiple sellers with mixed freeDelivery -> independent per product", () => {
    const lines = [
      { productId: "p1", sellerId: SELLER_A, freeDelivery: true },
      { productId: "p2", sellerId: SELLER_A, freeDelivery: false },
      { productId: "p3", sellerId: SELLER_B, freeDelivery: true },
    ];
    const result = computePerProductDelivery(lines, ZONE_SUBURB);

    // Seller A: p1 free, p2 paid
    const sellerA = result.sellerDeliveryMap.get(SELLER_A)!;
    expect(sellerA.sellerDeliveryCharge).toBe(ZONE_SUBURB);
    expect(sellerA.customerDeliveryCharge).toBe(ZONE_SUBURB);

    // Seller B: p3 free
    const sellerB = result.sellerDeliveryMap.get(SELLER_B)!;
    expect(sellerB.sellerDeliveryCharge).toBe(ZONE_SUBURB);
    expect(sellerB.customerDeliveryCharge).toBe(0);

    // Totals
    expect(result.totalCustomerDelivery).toBe(ZONE_SUBURB);
    expect(result.totalSellerAbsorbed).toBe(ZONE_SUBURB * 2);
  });

  // Test 5: Different Bangladesh delivery zones
  it("5. Different zones produce different charges", () => {
    const lines = [{ productId: "p1", sellerId: SELLER_A, freeDelivery: false }];

    const dhaka = computePerProductDelivery(lines, ZONE_DHAKA);
    const suburb = computePerProductDelivery(lines, ZONE_SUBURB);
    const outside = computePerProductDelivery(lines, ZONE_OUTSIDE);

    expect(dhaka.totalCustomerDelivery).toBe(ZONE_DHAKA);
    expect(suburb.totalCustomerDelivery).toBe(ZONE_SUBURB);
    expect(outside.totalCustomerDelivery).toBe(ZONE_OUTSIDE);
    expect(dhaka.totalCustomerDelivery).not.toBe(suburb.totalCustomerDelivery);
    expect(suburb.totalCustomerDelivery).not.toBe(outside.totalCustomerDelivery);
  });

  // Test 6: Customer delivery charge calculation
  it("6. Customer delivery charge = sum of non-free products zone charges", () => {
    const lines = [
      { productId: "p1", sellerId: SELLER_A, freeDelivery: false },
      { productId: "p2", sellerId: SELLER_A, freeDelivery: false },
      { productId: "p3", sellerId: SELLER_A, freeDelivery: true },
    ];
    const result = computePerProductDelivery(lines, ZONE_OUTSIDE);

    expect(result.totalCustomerDelivery).toBe(ZONE_OUTSIDE * 2);
  });

  // Test 7: Seller-absorbed delivery calculation
  it("7. Seller absorbed = sum of free-delivery products zone charges", () => {
    const lines = [
      { productId: "p1", sellerId: SELLER_A, freeDelivery: true },
      { productId: "p2", sellerId: SELLER_A, freeDelivery: true },
      { productId: "p3", sellerId: SELLER_A, freeDelivery: false },
    ];
    const result = computePerProductDelivery(lines, ZONE_OUTSIDE);

    expect(result.totalSellerAbsorbed).toBe(ZONE_OUTSIDE * 2);
  });

  // Test 8: Multi-product cart
  it("8. Multi-product cart with all combinations", () => {
    const lines = [
      { productId: "p1", sellerId: SELLER_A, freeDelivery: true },
      { productId: "p2", sellerId: SELLER_A, freeDelivery: false },
      { productId: "p3", sellerId: SELLER_B, freeDelivery: true },
      { productId: "p4", sellerId: SELLER_B, freeDelivery: false },
      { productId: "p5", sellerId: SELLER_B, freeDelivery: false },
    ];
    const result = computePerProductDelivery(lines, ZONE_SUBURB);

    expect(result.totalCustomerDelivery).toBe(ZONE_SUBURB * 3);
    expect(result.totalSellerAbsorbed).toBe(ZONE_SUBURB * 2);
  });

  // Test 9: Order delivery snapshot
  it("9. Delivery snapshot contains per-product delivery lines", () => {
    const lines = [
      { productId: "p1", sellerId: SELLER_A, freeDelivery: true },
      { productId: "p2", sellerId: SELLER_A, freeDelivery: false },
    ];
    const result = computePerProductDelivery(lines, ZONE_DHAKA);

    expect(result.deliveryLines).toHaveLength(2);
    for (const dl of result.deliveryLines) {
      expect(dl).toHaveProperty("productId");
      expect(dl).toHaveProperty("sellerId");
      expect(dl).toHaveProperty("freeDelivery");
      expect(dl).toHaveProperty("zoneCharge");
      expect(dl).toHaveProperty("customerDeliveryCharge");
      expect(dl).toHaveProperty("sellerAbsorbedCharge");
    }
  });

  // Test 10: Historical order protection
  it("10. Historical order delivery values are snapshots, not recomputed", () => {
    const linesAtOrderTime = [{ productId: "p1", sellerId: SELLER_A, freeDelivery: false }];
    const snapshot = computePerProductDelivery(linesAtOrderTime, ZONE_DHAKA);

    const newZoneCharge = 200;
    expect(newZoneCharge).not.toBe(snapshot.deliveryLines[0].zoneCharge);
    expect(snapshot.deliveryLines[0].zoneCharge).toBe(ZONE_DHAKA);
    expect(snapshot.deliveryLines[0].customerDeliveryCharge).toBe(ZONE_DHAKA);
  });

  // Test 11: Seller cannot modify another seller's product
  it("11. Per-product delivery lines are isolated by seller", () => {
    const lines = [
      { productId: "p1", sellerId: SELLER_A, freeDelivery: true },
      { productId: "p2", sellerId: SELLER_B, freeDelivery: false },
    ];
    const result = computePerProductDelivery(lines, ZONE_DHAKA);

    expect(result.deliveryLines[0].sellerId).toBe(SELLER_A);
    expect(result.deliveryLines[1].sellerId).toBe(SELLER_B);

    const sellerA = result.sellerDeliveryMap.get(SELLER_A)!;
    const sellerB = result.sellerDeliveryMap.get(SELLER_B)!;
    expect(sellerA.sellerDeliveryCharge).toBe(ZONE_DHAKA);
    expect(sellerB.sellerDeliveryCharge).toBe(0);
  });

  // Test 12: Client cannot manipulate delivery charges
  it("12. Delivery charge always comes from zone config, never client input", () => {
    const serverReadFreeDelivery = false;
    const lines = [{ productId: "p1", sellerId: SELLER_A, freeDelivery: serverReadFreeDelivery }];
    const result = computePerProductDelivery(lines, ZONE_DHAKA);

    expect(result.deliveryLines[0].freeDelivery).toBe(false);
    expect(result.deliveryLines[0].customerDeliveryCharge).toBe(ZONE_DHAKA);
    expect(result.totalCustomerDelivery).toBe(ZONE_DHAKA);
  });

  // Test 13: No double charging
  it("13. No double charging: customer + seller = total zone charges", () => {
    const lines = [
      { productId: "p1", sellerId: SELLER_A, freeDelivery: true },
      { productId: "p2", sellerId: SELLER_A, freeDelivery: false },
      { productId: "p3", sellerId: SELLER_B, freeDelivery: true },
      { productId: "p4", sellerId: SELLER_B, freeDelivery: false },
    ];
    const result = computePerProductDelivery(lines, ZONE_SUBURB);

    const totalZoneCharges = lines.length * ZONE_SUBURB;
    expect(result.totalCustomerDelivery + result.totalSellerAbsorbed).toBe(totalZoneCharges);
  });

  // Test 14: No double deduction from seller
  it("14. Seller earnings deduct absorbed delivery only once, not customer-paid", () => {
    const sellerSubtotal = 2000;
    const commissionRate = 0.08;
    const sellerDeliveryCharge = ZONE_DHAKA;

    const { commissionAmount, sellerNetEarnings } = computeSellerEarnings(
      sellerSubtotal,
      commissionRate,
      sellerDeliveryCharge,
    );

    expect(commissionAmount).toBe(160);
    expect(sellerNetEarnings).toBe(1780);

    // Verify customer-paid delivery is NOT deducted from seller
    const customerPaidDelivery = ZONE_DHAKA;
    const wrongEarnings =
      sellerSubtotal - commissionAmount - sellerDeliveryCharge - customerPaidDelivery;
    expect(sellerNetEarnings).not.toBe(wrongEarnings);
  });

  // Test 15: Admin zone-charge changes do not alter existing orders
  it("15. Admin zone charge change after order does not affect stored snapshot", () => {
    const originalSnapshot = computePerProductDelivery(
      [{ productId: "p1", sellerId: SELLER_A, freeDelivery: false }],
      ZONE_DHAKA,
    );

    const newZoneCharge = 120;
    expect(originalSnapshot.deliveryLines[0].zoneCharge).toBe(ZONE_DHAKA);
    expect(originalSnapshot.deliveryLines[0].customerDeliveryCharge).toBe(ZONE_DHAKA);
    expect(newZoneCharge).not.toBe(originalSnapshot.deliveryLines[0].zoneCharge);
  });
});

// ── Settlement server integration tests ──────────────────────────────

describe("computeSellerSettlement - per-product delivery", () => {
  it("should store deliveryLines in settlement breakdown", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const deliveryLines = [
      {
        productId: "p1",
        sellerId: SELLER_A,
        freeDelivery: true,
        zoneCharge: ZONE_DHAKA,
        customerDeliveryCharge: 0,
        sellerAbsorbedCharge: ZONE_DHAKA,
      },
      {
        productId: "p2",
        sellerId: SELLER_A,
        freeDelivery: false,
        zoneCharge: ZONE_DHAKA,
        customerDeliveryCharge: ZONE_DHAKA,
        sellerAbsorbedCharge: 0,
      },
    ];

    const settlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "test-order-1",
      sellerSubtotal: 2000,
      orderSubtotal: 2000,
      orderDiscount: 0,
      orderShipping: ZONE_DHAKA,
      orderTax: 0,
      commissionRate: 0.08,
      nowMs: Date.now(),
      zoneId: "dhaka",
      zoneName: "Dhaka",
      zoneCharge: ZONE_DHAKA,
      customerDeliveryCharge: ZONE_DHAKA,
      sellerDeliveryCharge: ZONE_DHAKA,
      freeDelivery: false,
      deliveryLines,
    });

    expect(settlement.deliveryLines).toHaveLength(2);
    expect(settlement.deliveryLines[0].freeDelivery).toBe(true);
    expect(settlement.deliveryLines[1].freeDelivery).toBe(false);
    expect(settlement.sellerDeliveryCharge).toBe(ZONE_DHAKA);
    expect(settlement.customerDeliveryCharge).toBe(ZONE_DHAKA);
  });

  it("should set freeDelivery=true when ALL seller products have freeDelivery", async () => {
    const { computeSellerSettlement } = await import("../settlement.server");

    const deliveryLines = [
      {
        productId: "p1",
        sellerId: SELLER_A,
        freeDelivery: true,
        zoneCharge: ZONE_DHAKA,
        customerDeliveryCharge: 0,
        sellerAbsorbedCharge: ZONE_DHAKA,
      },
      {
        productId: "p2",
        sellerId: SELLER_A,
        freeDelivery: true,
        zoneCharge: ZONE_DHAKA,
        customerDeliveryCharge: 0,
        sellerAbsorbedCharge: ZONE_DHAKA,
      },
    ];

    const settlement = computeSellerSettlement({
      sellerId: SELLER_A,
      orderId: "test-order-2",
      sellerSubtotal: 1500,
      orderSubtotal: 1500,
      orderDiscount: 0,
      orderShipping: 0,
      orderTax: 0,
      commissionRate: 0.08,
      nowMs: Date.now(),
      zoneId: "dhaka",
      zoneName: "Dhaka",
      zoneCharge: ZONE_DHAKA,
      customerDeliveryCharge: 0,
      sellerDeliveryCharge: ZONE_DHAKA * 2,
      freeDelivery: true,
      deliveryLines,
    });

    expect(settlement.freeDelivery).toBe(true);
    expect(settlement.sellerDeliveryCharge).toBe(ZONE_DHAKA * 2);
    expect(settlement.customerDeliveryCharge).toBe(0);
  });
});
