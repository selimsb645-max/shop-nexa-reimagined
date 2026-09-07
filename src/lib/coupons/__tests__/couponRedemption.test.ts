/**
 * Coupon redemption writes — emulator tests for the atomic checkout
 * commit: optimistic-lock race on the last usage, per-customer
 * counters, and immutable redemption records (replay/idempotency).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";
import {
  buildCouponRedemptionWrites,
  COUPONS_COLLECTION,
  COUPON_REDEMPTIONS_COLLECTION,
  COUPON_CUSTOMER_COUNTERS_COLLECTION,
  couponRedemptionDocId,
  couponCounterDocId,
} from "../coupon.server";
import { batchGetDocs, commitWrites, docPath, toFsFields } from "../../firebase-admin.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8096;
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

async function seedCoupon(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  await commitWrites(PID, [
    {
      update: {
        name: docPath(PID, [COUPONS_COLLECTION, "SAVE10"]),
        fields: toFsFields({
          code: "SAVE10",
          type: "percent",
          value: 10,
          minSubtotal: 0,
          startAt: null,
          expiresAt: null,
          active: true,
          usageLimit: 1,
          uses: 0,
          perCustomerLimit: 1,
          sellerId: null,
          productIds: [],
          categoryIds: [],
          maxDiscount: null,
          createdAt: now,
          updatedAt: now,
          ...overrides,
        }),
      },
      currentDocument: { exists: false },
    },
  ]);
  const docs = await batchGetDocs(PID, [docPath(PID, [COUPONS_COLLECTION, "SAVE10"])]);
  const d = docs.get(docPath(PID, [COUPONS_COLLECTION, "SAVE10"]))!;
  return d;
}

function redemptionInput(overrides: Record<string, unknown> = {}) {
  return {
    code: "SAVE10",
    userId: "cust-1",
    orderId: "order-1",
    discount: 100,
    base: 1000,
    couponUpdateTime: null as string | null,
    couponUses: 0,
    counterExists: false,
    counterUpdateTime: null as string | null,
    counterUserUses: 0,
    sellerId: null as string | null,
    nowMs: Date.now(),
    ...overrides,
  };
}

async function getDoc(collection: string, id: string) {
  const docs = await batchGetDocs(PID, [docPath(PID, [collection, id])]);
  return docs.get(docPath(PID, [collection, id]))!;
}

describe("atomic redemption commit", () => {
  it("writes uses + counter + redemption record together", async () => {
    const coupon = await seedCoupon({ usageLimit: null });
    const writes = buildCouponRedemptionWrites(
      PID,
      redemptionInput({
        couponUpdateTime: coupon.updateTime,
      }),
    );
    await commitWrites(PID, writes);

    const c = await getDoc(COUPONS_COLLECTION, "SAVE10");
    expect(Number(c.data["uses"])).toBe(1);

    const counter = await getDoc(
      COUPON_CUSTOMER_COUNTERS_COLLECTION,
      couponCounterDocId("SAVE10", "cust-1"),
    );
    expect(counter.exists).toBe(true);
    expect(Number(counter.data["count"])).toBe(1);

    const red = await getDoc(
      COUPON_REDEMPTIONS_COLLECTION,
      couponRedemptionDocId("SAVE10", "order-1"),
    );
    expect(red.exists).toBe(true);
    expect(red.data["orderId"]).toBe("order-1");
    expect(red.data["discount"]).toBe(100);
  });

  it("uses a masked write — other coupon fields survive the increment", async () => {
    const coupon = await seedCoupon({ usageLimit: null, minSubtotal: 500 });
    await commitWrites(
      PID,
      buildCouponRedemptionWrites(
        PID,
        redemptionInput({
          couponUpdateTime: coupon.updateTime,
        }),
      ),
    );
    const c = await getDoc(COUPONS_COLLECTION, "SAVE10");
    expect(Number(c.data["uses"])).toBe(1);
    expect(Number(c.data["minSubtotal"])).toBe(500); // NOT wiped
    expect(c.data["active"]).toBe(true); // NOT wiped
  });
});

describe("concurrency — the last usage race", () => {
  it("two concurrent checkouts for the LAST usage: one wins, the whole other checkout aborts", async () => {
    // usageLimit 1, both customers validated uses=0 against the SAME
    // snapshot (the exact double-redemption race the spec §5 forbids).
    const coupon = await seedCoupon({ usageLimit: 1 });
    const snapshotTime = coupon.updateTime;

    // Checkout A commits first
    await commitWrites(
      PID,
      buildCouponRedemptionWrites(
        PID,
        redemptionInput({
          userId: "cust-A",
          orderId: "order-A",
          couponUpdateTime: snapshotTime,
        }),
      ),
    );

    // Checkout B validated against the SAME (now stale) snapshot
    await expect(
      commitWrites(
        PID,
        buildCouponRedemptionWrites(
          PID,
          redemptionInput({
            userId: "cust-B",
            orderId: "order-B",
            couponUpdateTime: snapshotTime,
          }),
        ),
      ),
    ).rejects.toThrow();

    // Nothing from checkout B persisted — atomic abort
    const counterB = await getDoc(
      COUPON_CUSTOMER_COUNTERS_COLLECTION,
      couponCounterDocId("SAVE10", "cust-B"),
    );
    expect(counterB.exists).toBe(false);
    const redemptionB = await getDoc(
      COUPON_REDEMPTIONS_COLLECTION,
      couponRedemptionDocId("SAVE10", "order-B"),
    );
    expect(redemptionB.exists).toBe(false);
    const c = await getDoc(COUPONS_COLLECTION, "SAVE10");
    expect(Number(c.data["uses"])).toBe(1);
  });
});

describe("replay / idempotency", () => {
  it("a replayed redemption doc (same order) fails on the create-only precondition", async () => {
    const coupon = await seedCoupon({ usageLimit: null });
    const input = redemptionInput({ couponUpdateTime: coupon.updateTime });
    await commitWrites(PID, buildCouponRedemptionWrites(PID, input));

    const freshCoupon = await getDoc(COUPONS_COLLECTION, "SAVE10");
    const counter = await getDoc(
      COUPON_CUSTOMER_COUNTERS_COLLECTION,
      couponCounterDocId("SAVE10", "cust-1"),
    );
    // replay with the SAME orderId but freshly-read versions — the
    // redemption record's exists:false precondition still stops it
    await expect(
      commitWrites(
        PID,
        buildCouponRedemptionWrites(
          PID,
          redemptionInput({
            couponUpdateTime: freshCoupon.updateTime,
            couponUses: 1,
            counterExists: true,
            counterUpdateTime: counter.updateTime,
            counterUserUses: 1,
          }),
        ),
      ),
    ).rejects.toThrow();
    const c = await getDoc(COUPONS_COLLECTION, "SAVE10");
    expect(Number(c.data["uses"])).toBe(1); // no double redemption
  });

  it("per-customer counter collides when two devices of the same user race", async () => {
    await seedCoupon({ usageLimit: null });
    // BOTH devices validated against the SAME coupon + counter
    // snapshot (perCustomerLimit: 1) — the exact same-user race.
    const coupon = await getDoc(COUPONS_COLLECTION, "SAVE10");
    const counterSnap = await getDoc(
      COUPON_CUSTOMER_COUNTERS_COLLECTION,
      couponCounterDocId("SAVE10", "cust-1"),
    );
    const snapshot = {
      couponUpdateTime: coupon.updateTime,
      couponUses: 0,
      counterExists: counterSnap.exists,
      counterUpdateTime: counterSnap.updateTime,
      counterUserUses: 0,
    };

    // Device A commits first
    await commitWrites(
      PID,
      buildCouponRedemptionWrites(PID, redemptionInput({ orderId: "order-1", ...snapshot })),
    );

    // Device B commits with the SAME (now stale) snapshots — aborts
    await expect(
      commitWrites(
        PID,
        buildCouponRedemptionWrites(PID, redemptionInput({ orderId: "order-2", ...snapshot })),
      ),
    ).rejects.toThrow();

    const counterAfter = await getDoc(
      COUPON_CUSTOMER_COUNTERS_COLLECTION,
      couponCounterDocId("SAVE10", "cust-1"),
    );
    expect(Number(counterAfter.data["count"])).toBe(1);
    const redemptionB = await getDoc(
      COUPON_REDEMPTIONS_COLLECTION,
      couponRedemptionDocId("SAVE10", "order-2"),
    );
    expect(redemptionB.exists).toBe(false);
  });
});
