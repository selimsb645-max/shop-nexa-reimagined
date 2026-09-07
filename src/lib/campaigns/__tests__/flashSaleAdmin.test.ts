/**
 * Flash Sale Scheduling — admin layer tests.
 *
 * Covers the deterministic effective status (server-clock derived,
 * never a persisted cosmetic field), Option-A overlap conflict
 * prevention at write time, reschedule validation (incl. the
 * updateMask discipline), enable/disable, the admin listing view
 * and the FLASH_SALE_* audit trail.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";
import {
  createFlashSale,
  computeFlashSaleStatus,
  getFlashSale,
  listFlashSales,
  setFlashSaleEnabled,
  updateFlashSale,
  FLASH_SALES_COLLECTION,
} from "../flashSale.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8094;
const PID = "test-project";
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/${PID}/databases/(default)/documents`;
const ACTOR = { id: "admin_1", role: "super_admin" };

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

function input(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    campaignId: "c1",
    productId: "p1",
    startAt: now - 1000,
    endAt: now + 3_600_000,
    stockLimit: 10,
    perCustomerLimit: 2,
    originalPriceMinor: 500000,
    salePriceMinor: 350000,
    ...overrides,
  };
}

describe("effective status derivation (server clock, never a device countdown)", () => {
  const now = 1_000_000;
  const sale = { active: true, startAt: now - 100, endAt: now + 100 };

  it("DISABLED beats everything when the sale is disabled", () => {
    expect(computeFlashSaleStatus({ ...sale, active: false }, now)).toBe("DISABLED");
    expect(computeFlashSaleStatus({ ...sale, active: false }, now - 1000)).toBe("DISABLED");
  });
  it("SCHEDULED before startAt, ACTIVE inside the window, ENDED at/after endAt", () => {
    expect(computeFlashSaleStatus(sale, now - 101)).toBe("SCHEDULED");
    expect(computeFlashSaleStatus(sale, now)).toBe("ACTIVE");
    expect(computeFlashSaleStatus(sale, now + 99)).toBe("ACTIVE");
    expect(computeFlashSaleStatus(sale, now + 100)).toBe("ENDED");
    expect(computeFlashSaleStatus(sale, now + 999)).toBe("ENDED");
  });
  it("an ENDED sale can never read as ACTIVE regardless of a stale flag", () => {
    // active:true persisted, but the window is over — derived status wins.
    expect(computeFlashSaleStatus({ active: true, startAt: 0, endAt: 1 }, 1_000_000)).toBe("ENDED");
  });
});

describe("Option-A overlap conflict prevention (write-time)", () => {
  it("rejects a second overlapping active sale for the same product", async () => {
    await createFlashSale(PID, input(), { actor: ACTOR });
    await expect(
      createFlashSale(
        PID,
        input({
          campaignId: "c2",
          startAt: Date.now() + 1_800_000,
          endAt: Date.now() + 5_400_000,
        }),
      ),
    ).rejects.toThrow(/flashsale\/conflict/);
  });
  it("accepts a NON-overlapping window for the same product (back-to-back sales)", async () => {
    await createFlashSale(PID, input(), { actor: ACTOR });
    await expect(
      createFlashSale(
        PID,
        input({
          campaignId: "c2",
          startAt: Date.now() + 3_600_001,
          endAt: Date.now() + 7_200_000,
        }),
      ),
    ).resolves.toBeTruthy();
  });
  it("accepts an overlapping window for a DIFFERENT product", async () => {
    await createFlashSale(PID, input(), { actor: ACTOR });
    await expect(
      createFlashSale(PID, input({ campaignId: "c2", productId: "p2" })),
    ).resolves.toBeTruthy();
  });
  it("accepts overlap when the other sale is DISABLED (it cannot serve)", async () => {
    await createFlashSale(PID, input(), { actor: ACTOR });
    await setFlashSaleEnabled(PID, "c1", false, { actor: ACTOR });
    await expect(createFlashSale(PID, input({ campaignId: "c2" }))).resolves.toBeTruthy();
  });
});

describe("updateFlashSale — reschedule + validation + updateMask discipline", () => {
  it("reschedules the window and audits RESCHEDULED", async () => {
    await createFlashSale(PID, input({ campaignId: "c1" }), { actor: ACTOR });
    const next = await updateFlashSale(
      PID,
      "c1",
      {
        startAt: Date.now() + 60_000,
        endAt: Date.now() + 7_200_000,
      },
      { actor: ACTOR },
    );
    expect(next.startAt).toBeGreaterThan(Date.now());
    const doc = await getFlashSale(PID, "c1");
    expect(doc?.endAt).toBe(next.endAt);
    // audit trail entry exists
    const res = await fetch(`${BASE}/auditTrail?pageSize=20`);
    const j = (await res.json()) as { documents?: Array<{ fields?: Record<string, unknown> }> };
    const actions = (j.documents ?? []).map(
      (d) => (d.fields?.["action"] as { stringValue?: string })?.stringValue,
    );
    expect(actions).toContain("FLASH_SALE_CREATED");
    expect(actions).toContain("FLASH_SALE_RESCHEDULED");
  });

  it("rejects endAt <= startAt", async () => {
    await createFlashSale(PID, input({ campaignId: "c1" }));
    await expect(updateFlashSale(PID, "c1", { endAt: Date.now() - 5000 })).rejects.toThrow(
      /endAt must be after startAt/,
    );
  });

  it("rejects stockLimit below the reserved count", async () => {
    await createFlashSale(PID, input({ campaignId: "c1", stockLimit: 10 }));
    // simulate 4 in-flight reservations
    const r = await fetch(
      `${BASE}/${FLASH_SALES_COLLECTION}/c1?updateMask.fieldPaths=stockReserved`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields: { stockReserved: { integerValue: 4 } } }),
      },
    );
    expect(r.ok).toBe(true);
    await expect(updateFlashSale(PID, "c1", { stockLimit: 3 })).rejects.toThrow(
      /stockLimit cannot drop below/,
    );
    await expect(updateFlashSale(PID, "c1", { stockLimit: 4 })).resolves.toBeTruthy();
  });

  it("rejects a product switch while stock is reserved", async () => {
    await createFlashSale(PID, input({ campaignId: "c1" }));
    await fetch(`${BASE}/${FLASH_SALES_COLLECTION}/c1?updateMask.fieldPaths=stockReserved`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { stockReserved: { integerValue: 1 } } }),
    });
    await expect(updateFlashSale(PID, "c1", { productId: "p2" })).rejects.toThrow(
      /cannot change the sale product/,
    );
  });

  it("rejects a retro (past) endAt while stock is reserved", async () => {
    await createFlashSale(PID, input({ campaignId: "c1" }));
    await fetch(`${BASE}/${FLASH_SALES_COLLECTION}/c1?updateMask.fieldPaths=stockReserved`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { stockReserved: { integerValue: 1 } } }),
    });
    await expect(
      updateFlashSale(PID, "c1", { endAt: Date.now() - 5_000, startAt: Date.now() - 10_000 }),
    ).rejects.toThrow(/cannot schedule the end in the past/);
  });

  it("masked update NEVER wipes untouched fields (updateMask discipline)", async () => {
    await createFlashSale(PID, input({ campaignId: "c1", stockLimit: 10 }));
    // an extra field written outside the engine's own shape must survive
    await fetch(`${BASE}/${FLASH_SALES_COLLECTION}/c1?updateMask.fieldPaths=operatorNote`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { operatorNote: { stringValue: "keep me" } } }),
    });
    await updateFlashSale(PID, "c1", { stockLimit: 8 });
    const res = await fetch(`${BASE}/${FLASH_SALES_COLLECTION}/c1`);
    const j = (await res.json()) as { fields?: Record<string, unknown> };
    expect((j.fields?.["operatorNote"] as { stringValue?: string })?.stringValue).toBe("keep me");
    expect(Number((j.fields?.["stockTotal"] as { integerValue?: number })?.integerValue)).toBe(8);
    expect(Number((j.fields?.["salePriceMinor"] as { integerValue?: number })?.integerValue)).toBe(
      350000,
    );
  });

  it("empty patch is a no-op (no write, no audit)", async () => {
    await createFlashSale(PID, input({ campaignId: "c1" }), { actor: ACTOR });
    const doc = await updateFlashSale(PID, "c1", {});
    expect(doc).toEqual(await getFlashSale(PID, "c1"));
  });
});

describe("enable/disable", () => {
  it("disable → DISABLED, re-enable runs the conflict check", async () => {
    await createFlashSale(PID, input({ campaignId: "c1" }), { actor: ACTOR });
    await setFlashSaleEnabled(PID, "c1", false, { actor: ACTOR });
    expect(computeFlashSaleStatus((await getFlashSale(PID, "c1"))!)).toBe("DISABLED");
    await setFlashSaleEnabled(PID, "c1", true, { actor: ACTOR });
    expect(computeFlashSaleStatus((await getFlashSale(PID, "c1"))!)).toBe("ACTIVE");

    // an overlapping second sale blocks the re-enable
    await setFlashSaleEnabled(PID, "c1", false, { actor: ACTOR });
    await createFlashSale(PID, input({ campaignId: "c2", endAt: Date.now() + 7_200_000 }), {
      allowOverlap: true,
    });
    await expect(setFlashSaleEnabled(PID, "c1", true, { actor: ACTOR })).rejects.toThrow(
      /flashsale\/conflict/,
    );
  });

  it("idempotent enable/disable (same state is a clean no-op)", async () => {
    await createFlashSale(PID, input({ campaignId: "c1" }), { actor: ACTOR });
    const doc = await setFlashSaleEnabled(PID, "c1", true, { actor: ACTOR });
    expect(doc.active).toBe(true);
  });

  it("audits ENABLED and DISABLED", async () => {
    await createFlashSale(PID, input({ campaignId: "c1" }));
    await setFlashSaleEnabled(PID, "c1", false, { actor: ACTOR });
    await setFlashSaleEnabled(PID, "c1", true, { actor: ACTOR });
    const res = await fetch(`${BASE}/auditTrail?pageSize=20`);
    const j = (await res.json()) as { documents?: Array<{ fields?: Record<string, unknown> }> };
    const actions = (j.documents ?? []).map(
      (d) => (d.fields?.["action"] as { stringValue?: string })?.stringValue,
    );
    expect(actions).toContain("FLASH_SALE_DISABLED");
    expect(actions).toContain("FLASH_SALE_ENABLED");
  });
});

describe("admin listing — derived status view", () => {
  it("lists sales with server-clock-derived status and stock", async () => {
    const now = Date.now();
    await createFlashSale(
      PID,
      input({
        campaignId: "c_active",
        startAt: now - 1000,
        endAt: now + 3_600_000,
      }),
      { actor: ACTOR },
    );
    await createFlashSale(
      PID,
      input({
        campaignId: "c_soon",
        productId: "p2",
        startAt: now + 3_600_001,
        endAt: now + 7_200_000,
      }),
      { actor: ACTOR },
    );
    await createFlashSale(
      PID,
      input({
        campaignId: "c_over",
        productId: "p3",
        startAt: now - 7_200_000,
        endAt: now - 3_600_000,
      }),
      { actor: ACTOR },
    );
    const list = await listFlashSales(PID);
    const byId = new Map(list.map((s) => [s.campaignId, s]));
    expect(byId.get("c_active")?.status).toBe("ACTIVE");
    expect(byId.get("c_soon")?.status).toBe("SCHEDULED");
    expect(byId.get("c_over")?.status).toBe("ENDED");
    expect(byId.get("c_active")?.stockRemaining).toBe(10);
  });
});

// ───────────────────────────────────────────────────────────────
// Security rules audit — flashSales must be server-write-only.
// Same regex-audit discipline as listingRegistry/qc-security-audit:
// the scheduling core (backend engine + panel bridge) is the ONLY
// writer; a client write path of ANY role would bypass Option-A
// conflict prevention, stock guards, price safety and audit.
// ───────────────────────────────────────────────────────────────
describe("firestore.rules — flashSales security audit", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  const rules = fs.readFileSync("firestore.rules", "utf-8");
  const blockMatch = rules.match(/match \/flashSales\/\{campaignId\} \{[\s\S]*?\n {4}\}/);
  const block = blockMatch?.[0] ?? "";
  const countersMatch = rules.match(
    /match \/flashSalePurchases\/\{purchaseId\} \{[\s\S]*?\n {4}\}/,
  );
  const counters = countersMatch?.[0] ?? "";

  it("has a dedicated match block for the flashSales collection", () => {
    expect(block).toBeTruthy();
  });

  // Fail fast outside `it` so TS narrows `block` for the assertions below.
  if (!block) throw new Error("flashSales rules block not found — aborting audit");

  it("reads stay manager-gated / seller-gated (no public read)", () => {
    expect(block).toContain("allow read: if isCampaignManager()");
    expect(block).toContain("isApprovedSeller()");
    expect(block).not.toContain("allow read: if true");
    expect(block).not.toContain("allow read: if request.auth != null");
  });

  it("ALL client writes are denied — scheduling core only (no campaign-manager client path)", () => {
    expect(block).toContain("allow write: if false;");
    // The old Prompt-05 client-write path must not come back:
    expect(block).not.toContain("allow create, update: if isCampaignManager()");
    expect(block).not.toMatch(/allow (create|update|delete): if (?!false)/);
  });

  it("per-customer purchase counters stay server-transaction-only", () => {
    expect(counters).toBeTruthy();
    expect(counters).toContain("allow write: if false;");
  });
});
