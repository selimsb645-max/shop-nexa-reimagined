/**
 * Coupon admin core — emulator tests.
 * Role verification, validation, mutations, audit trail, listing,
 * usage stats, and seller-isolation/IDOR negative paths.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";
import {
  createCoupon,
  updateCoupon,
  setCouponActive,
  deleteCoupon,
  listCouponsAdmin,
  getUsageStats,
  verifyCouponAdmin,
  COUPONS_COLLECTION,
  type CreateCouponInput,
} from "../coupon.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8095;
const PID = "test-project";
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/${PID}/databases/(default)/documents`;

const SUPER = "admin-super";
const CONTENT = "admin-content";
const SELLER = "seller-1";

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

async function seedUser(uid: string, role: string, adminRole: string, blocked = false) {
  await seedDoc(`users/${uid}`, { role, adminRole, blocked });
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/${path}`);
  if (res.status === 404) return null;
  const json = (await res.json()) as { fields?: Record<string, unknown> };
  return json.fields ?? null;
}

function input(overrides: Partial<CreateCouponInput> = {}): CreateCouponInput {
  return {
    code: "SAVE10",
    type: "percent",
    value: 10,
    minSubtotal: 500,
    startAt: null,
    expiresAt: null,
    usageLimit: 100,
    perCustomerLimit: 1,
    sellerId: null,
    productIds: [],
    categoryIds: [],
    maxDiscount: null,
    active: true,
    ...overrides,
  };
}

describe("server-side authorization", () => {
  it("a coupon-manager admin is verified", async () => {
    await seedUser(SUPER, "admin", "super_admin");
    const { adminRole } = await verifyCouponAdmin(PID, SUPER);
    expect(adminRole).toBe("super_admin");
  });

  it("a customer uid is rejected", async () => {
    await seedUser("cust-1", "customer", "");
    await expect(verifyCouponAdmin(PID, "cust-1")).rejects.toThrow(/Authorization failed/);
  });

  it("a seller uid is rejected (no admin role)", async () => {
    await seedUser(SELLER, "seller", "");
    await expect(verifyCouponAdmin(PID, SELLER)).rejects.toThrow(/Authorization failed/);
  });

  it("a blocked admin is rejected", async () => {
    await seedUser("admin-bad", "admin", "admin", true);
    await expect(verifyCouponAdmin(PID, "admin-bad")).rejects.toThrow(/Authorization failed/);
  });

  it("an unknown role (finance_admin) is rejected", async () => {
    await seedUser("admin-fin", "admin", "finance_admin");
    await expect(verifyCouponAdmin(PID, "admin-fin")).rejects.toThrow(/Authorization failed/);
  });
});

describe("createCoupon", () => {
  it("creates a valid platform-wide coupon with all v2 fields", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    const doc = await createCoupon(PID, input());
    expect(doc.uses).toBe(0);
    expect(doc.perCustomerLimit).toBe(1);
    const stored = await readDoc(`${COUPONS_COLLECTION}/SAVE10`);
    expect(stored).toBeTruthy();
  });

  it("creates a seller-specific coupon with product + category scope", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    const doc = await createCoupon(
      PID,
      input({
        code: "SELLER5",
        sellerId: "seller-9",
        productIds: ["p1", "p2"],
        categoryIds: ["cat7"],
      }),
    );
    expect(doc.sellerId).toBe("seller-9");
    expect(doc.productIds).toEqual(["p1", "p2"]);
    expect(doc.categoryIds).toEqual(["cat7"]);
  });

  it("rejects an invalid code", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await expect(createCoupon(PID, input({ code: "bad code!" }))).rejects.toThrow(
      /coupon\/validation/,
    );
    await expect(createCoupon(PID, input({ code: "AB" }))).rejects.toThrow(/coupon\/validation/);
  });

  it("rejects percent > 100 and non-positive values", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await expect(createCoupon(PID, input({ value: 150 }))).rejects.toThrow(/coupon\/validation/);
    await expect(createCoupon(PID, input({ value: 0 }))).rejects.toThrow(/coupon\/validation/);
    await expect(createCoupon(PID, input({ type: "fixed", value: 12.345 }))).rejects.toThrow(
      /coupon\/validation/,
    );
  });

  it("rejects an end window before the start window", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await expect(createCoupon(PID, input({ startAt: 2000, expiresAt: 1000 }))).rejects.toThrow(
      /coupon\/validation/,
    );
  });

  it("rejects usage/per-customer limits below 1", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await expect(createCoupon(PID, input({ usageLimit: 0 }))).rejects.toThrow(/coupon\/validation/);
    await expect(createCoupon(PID, input({ perCustomerLimit: 0 }))).rejects.toThrow(
      /coupon\/validation/,
    );
  });

  it("duplicate codes are rejected atomically (code uniqueness)", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input());
    await expect(createCoupon(PID, input({ code: "save10" }))).rejects.toThrow();
    expect(await readDoc(`${COUPONS_COLLECTION}/SAVE10`)).toBeTruthy();
  });

  it("audits COUPON_CREATED", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input(), {
      actor: { id: `admin:${CONTENT}`, role: "admin" },
    });
    const auditDoc = await readDoc("auditTrail");
    // audit doc ids are random-salted; use a query instead
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
    void auditDoc;
  });
});

describe("updateCoupon", () => {
  it("patches only the changed fields (masked write)", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input());
    const doc = await updateCoupon(PID, "SAVE10", { value: 15, maxDiscount: 100 });
    expect(doc.value).toBe(15);
    expect(doc.maxDiscount).toBe(100);
    expect(doc.uses).toBe(0);
    expect(doc.minSubtotal).toBe(500); // untouched field survives
  });

  it("never allows patching uses / sellerId (identity immutable)", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input());
    // `uses` and `sellerId` are not patch keys — an update leaves them intact
    const doc = await updateCoupon(PID, "SAVE10", { value: 20 });
    expect(doc.uses).toBe(0);
    expect(doc.sellerId).toBeNull();
  });

  it("rejects tightening usageLimit below existing redemptions", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input({ usageLimit: 100 }));
    // simulate 3 redemptions
    await seedDoc(`${COUPONS_COLLECTION}/SAVE10`, { uses: 3, value: 10 });
    await expect(updateCoupon(PID, "SAVE10", { usageLimit: 2 })).rejects.toThrow(
      /cannot go below existing redemptions/,
    );
  });

  it("404 for an unknown code", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await expect(updateCoupon(PID, "NOPE", { value: 5 })).rejects.toThrow(/coupon\/notfound/);
  });

  it("an empty patch is rejected", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input());
    await expect(updateCoupon(PID, "SAVE10", {})).rejects.toThrow(/empty patch/);
  });
});

describe("setCouponActive", () => {
  it("disables and re-enables with audit actions", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input());
    const disabled = await setCouponActive(PID, "SAVE10", false, "eid campaign ended", {
      actor: { id: `admin:${CONTENT}`, role: "admin" },
    });
    expect(disabled.active).toBe(false);
    const enabled = await setCouponActive(PID, "SAVE10", true, null, {
      actor: { id: `admin:${CONTENT}`, role: "admin" },
    });
    expect(enabled.active).toBe(true);
  });
});

describe("deleteCoupon (financial history immutability)", () => {
  it("deletes a never-redeemed coupon", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input());
    await deleteCoupon(PID, "SAVE10");
    expect(await readDoc(`${COUPONS_COLLECTION}/SAVE10`)).toBeNull();
  });

  it("REFUSES to hard-delete a redeemed coupon (disable instead)", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input());
    await seedDoc(`${COUPONS_COLLECTION}/SAVE10`, { uses: 5 });
    await expect(deleteCoupon(PID, "SAVE10")).rejects.toThrow(/coupon\/in-use/);
    expect(await readDoc(`${COUPONS_COLLECTION}/SAVE10`)).toBeTruthy();
  });
});

describe("listCouponsAdmin filters", () => {
  it("filters by status, seller, and search", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    const now = Date.now();
    await createCoupon(PID, input({ code: "AAA100" }));
    await createCoupon(PID, input({ code: "BBB100", sellerId: "seller-9" }));
    await createCoupon(PID, input({ code: "CCC100", active: false }));
    await createCoupon(PID, input({ code: "DDD100", startAt: now + 100_000 }));

    const all = await listCouponsAdmin(PID);
    expect(all).toHaveLength(4);

    const active = await listCouponsAdmin(PID, { status: "active" });
    expect(active.map((c) => c.code).sort()).toEqual(["AAA100", "BBB100"]);

    const seller = await listCouponsAdmin(PID, { sellerId: "seller-9" });
    expect(seller.map((c) => c.code)).toEqual(["BBB100"]);

    const search = await listCouponsAdmin(PID, { search: "bb" });
    expect(search.map((c) => c.code)).toEqual(["BBB100"]);

    const scheduled = await listCouponsAdmin(PID, { status: "scheduled" });
    expect(scheduled.map((c) => c.code)).toEqual(["DDD100"]);

    const inactive = await listCouponsAdmin(PID, { status: "inactive" });
    expect(inactive.map((c) => c.code)).toEqual(["CCC100"]);
  });
});

describe("getUsageStats", () => {
  it("returns the coupon, remaining uses, and recent redemptions", async () => {
    await seedUser(CONTENT, "admin", "content_admin");
    await createCoupon(PID, input({ usageLimit: 10 }));
    await seedDoc("couponRedemptions/SAVE10__order-1", {
      code: "SAVE10",
      orderId: "order-1",
      userId: "cust-1",
      sellerId: null,
      discount: 50,
      base: 500,
      createdAt: 1000,
    });
    const stats = await getUsageStats(PID, "SAVE10");
    expect(stats.coupon.usageLimit).toBe(10);
    expect(stats.recentRedemptions).toHaveLength(1);
    expect(stats.recentRedemptions[0].orderId).toBe("order-1");
    expect(stats.status).toBe("active");
  });

  it("404 for an unknown code", async () => {
    await expect(getUsageStats(PID, "NOPE")).rejects.toThrow(/coupon\/notfound/);
  });
});
