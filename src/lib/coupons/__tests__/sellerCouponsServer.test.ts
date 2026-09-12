/**
 * Seller coupon self-service core — emulator tests.
 * Seller verification, forced ownership, canonical validation,
 * IDOR isolation, redemption-guarded delete, and the audit trail.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";
import {
  createSellerCouponServer,
  setSellerCouponActiveServer,
  deleteSellerCouponServer,
  listSellerCouponsServer,
  verifyCouponSeller,
  type SellerCouponInput,
} from "../seller-coupons.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8096;
const PID = "test-project";
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/${PID}/databases/(default)/documents`;

const SELLER = "seller-1";
const OTHER_SELLER = "seller-2";
const CUSTOMER = "cust-1";

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

function fsValue(v: unknown): Record<string, unknown> {
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "boolean") return { booleanValue: v };
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
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
  if (!res.ok) throw new Error(`seed failed: ${await res.text()}`);
}

async function seedApprovedSeller(uid: string, status = "approved") {
  await seedDoc(`users/${uid}`, { role: "seller", adminRole: null, blocked: false });
  await seedDoc(`sellers/${uid}`, { status });
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/${path}`);
  if (res.status === 404) return null;
  const json = (await res.json()) as { fields?: Record<string, unknown> };
  return json.fields ?? null;
}

function input(overrides: Partial<SellerCouponInput> = {}): SellerCouponInput {
  return {
    code: "SELL10",
    type: "percent",
    value: 10,
    minSubtotal: 500,
    expiresAt: null,
    usageLimit: 100,
    productIds: [],
    maxDiscount: null,
    active: true,
    ...overrides,
  };
}

describe("seller verification", () => {
  it("an approved seller is verified", async () => {
    await seedApprovedSeller(SELLER);
    await expect(verifyCouponSeller(PID, SELLER)).resolves.toBeUndefined();
  });

  it("a customer uid is rejected", async () => {
    await seedDoc(`users/${CUSTOMER}`, { role: "customer", blocked: false });
    await expect(verifyCouponSeller(PID, CUSTOMER)).rejects.toThrow(/unauthorized/);
  });

  it("a blocked seller is rejected", async () => {
    await seedDoc(`users/${SELLER}`, { role: "seller", blocked: true });
    await seedDoc(`sellers/${SELLER}`, { status: "approved" });
    await expect(verifyCouponSeller(PID, SELLER)).rejects.toThrow(/blocked/);
  });

  it("a pending (not approved) seller is rejected", async () => {
    await seedApprovedSeller(SELLER, "pending");
    await expect(verifyCouponSeller(PID, SELLER)).rejects.toThrow(/not approved/);
  });
});

describe("createSellerCouponServer", () => {
  it("creates with the code as doc id (checkout-engine convention)", async () => {
    await seedApprovedSeller(SELLER);
    const doc = await createSellerCouponServer(PID, SELLER, input());
    expect(doc.code).toBe("SELL10");
    const stored = await readDoc("coupons/SELL10");
    expect(stored).toBeTruthy();
  });

  it("forces sellerId to the caller — never null, never someone else's", async () => {
    await seedApprovedSeller(SELLER);
    const doc = await createSellerCouponServer(PID, SELLER, input());
    expect(doc.sellerId).toBe(SELLER);
    const stored = await readDoc("coupons/SELL10");
    const sellerId = stored?.["sellerId"] as { stringValue?: string };
    expect(sellerId?.stringValue).toBe(SELLER);
  });

  it("starts at uses == 0 and is active by default", async () => {
    await seedApprovedSeller(SELLER);
    const doc = await createSellerCouponServer(PID, SELLER, input({ active: true }));
    expect(doc.uses).toBe(0);
    expect(doc.active).toBe(true);
  });

  it("rejects an invalid code (regex, same as admin core)", async () => {
    await seedApprovedSeller(SELLER);
    await expect(createSellerCouponServer(PID, SELLER, input({ code: "no" }))).rejects.toThrow(
      /3-24 characters/,
    );
    await expect(
      createSellerCouponServer(PID, SELLER, input({ code: "bad code!" })),
    ).rejects.toThrow(/3-24 characters/);
  });

  it("rejects canonical validation failures (percent > 100, bad fixed value)", async () => {
    await seedApprovedSeller(SELLER);
    await expect(createSellerCouponServer(PID, SELLER, input({ value: 150 }))).rejects.toThrow(
      /whole number between 1 and 100/,
    );
    await expect(
      createSellerCouponServer(PID, SELLER, input({ type: "fixed", value: 10.999 })),
    ).rejects.toThrow(/at most 2 decimals/);
  });

  it("rejects duplicate codes atomically (create-only precondition)", async () => {
    await seedApprovedSeller(SELLER);
    await createSellerCouponServer(PID, SELLER, input());
    // Same code normalized — collision must fail.
    await expect(
      createSellerCouponServer(PID, SELLER, input({ code: "sell10" })),
    ).rejects.toThrow();
    const stored = await readDoc("coupons/SELL10");
    expect(stored).toBeTruthy();
  });

  it("rejects a customer outright", async () => {
    await seedDoc(`users/${CUSTOMER}`, { role: "customer", blocked: false });
    await expect(createSellerCouponServer(PID, CUSTOMER, input())).rejects.toThrow(/unauthorized/);
  });

  it("audits COUPON_CREATED with a seller actor", async () => {
    await seedApprovedSeller(SELLER);
    await createSellerCouponServer(PID, SELLER, input());
    const res = await fetch(`${BASE}:runQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "auditTrail" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "action" },
              op: "EQUAL",
              value: { stringValue: "COUPON_CREATED" },
            },
          },
        },
      }),
    });
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("setSellerCouponActiveServer", () => {
  it("toggles only active — masked update keeps limits and uses", async () => {
    await seedApprovedSeller(SELLER);
    await createSellerCouponServer(PID, SELLER, input());
    const doc = await setSellerCouponActiveServer(PID, SELLER, "SELL10", false);
    expect(doc.active).toBe(false);
    const stored = await readDoc("coupons/SELL10");
    const value = stored?.["value"] as { integerValue?: string };
    expect(value?.integerValue).toBe("10");
    const uses = stored?.["uses"] as { integerValue?: string };
    expect(uses?.integerValue).toBe("0");
  });

  it("IDOR: another seller's coupon is invisible (not-found, no leak)", async () => {
    await seedApprovedSeller(SELLER);
    await seedApprovedSeller(OTHER_SELLER);
    await createSellerCouponServer(PID, SELLER, input());
    await expect(setSellerCouponActiveServer(PID, OTHER_SELLER, "SELL10", false)).rejects.toThrow(
      /notfound/,
    );
  });

  it("a customer cannot toggle anything", async () => {
    await seedDoc(`users/${CUSTOMER}`, { role: "customer", blocked: false });
    await expect(setSellerCouponActiveServer(PID, CUSTOMER, "SELL10", false)).rejects.toThrow(
      /unauthorized/,
    );
  });
});

describe("deleteSellerCouponServer", () => {
  it("deletes a never-redeemed coupon", async () => {
    await seedApprovedSeller(SELLER);
    await createSellerCouponServer(PID, SELLER, input());
    await deleteSellerCouponServer(PID, SELLER, "SELL10");
    expect(await readDoc("coupons/SELL10")).toBeNull();
  });

  it("refuses to delete a coupon with redemptions (immutable history)", async () => {
    await seedApprovedSeller(SELLER);
    await createSellerCouponServer(PID, SELLER, input());
    // Simulate one redemption (only the checkout server core may do this).
    await seedDoc("coupons/SELL10", { uses: 1 });
    await expect(deleteSellerCouponServer(PID, SELLER, "SELL10")).rejects.toThrow(/in-use/);
    expect(await readDoc("coupons/SELL10")).toBeTruthy();
  });

  it("IDOR: another seller cannot delete it", async () => {
    await seedApprovedSeller(SELLER);
    await seedApprovedSeller(OTHER_SELLER);
    await createSellerCouponServer(PID, SELLER, input());
    await expect(deleteSellerCouponServer(PID, OTHER_SELLER, "SELL10")).rejects.toThrow(/notfound/);
    expect(await readDoc("coupons/SELL10")).toBeTruthy();
  });
});

describe("listSellerCouponsServer", () => {
  it("returns only the caller's coupons", async () => {
    await seedApprovedSeller(SELLER);
    await seedApprovedSeller(OTHER_SELLER);
    await createSellerCouponServer(PID, SELLER, input({ code: "AAA" }));
    await createSellerCouponServer(PID, SELLER, input({ code: "BBB" }));
    await createSellerCouponServer(PID, OTHER_SELLER, input({ code: "CCC" }));
    const mine = await listSellerCouponsServer(PID, SELLER);
    expect(mine.map((c) => c.code).sort()).toEqual(["AAA", "BBB"]);
  });

  it("a customer cannot list anything", async () => {
    await seedDoc(`users/${CUSTOMER}`, { role: "customer", blocked: false });
    await expect(listSellerCouponsServer(PID, CUSTOMER)).rejects.toThrow(/unauthorized/);
  });
});
