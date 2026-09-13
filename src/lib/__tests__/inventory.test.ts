// ═══════════════════════════════════════════════════════════════
// Inventory Reservation tests (Implementation Prompt 03 §2, §10)
// ═══════════════════════════════════════════════════════════════
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the REST transaction layer ────────────────────────────
type FetchedDoc = { exists: boolean; data: Record<string, unknown>; updateTime: string | null };

let products: Record<string, Record<string, number | string>> = {};
let reservations: Record<string, Record<string, string>> = {};
let committedWrites: unknown[] = [];
let abortOnce = false; // next commit aborts (simulates a concurrent writer)

vi.mock("../firebase-admin.server", () => ({
  beginTransaction: vi.fn(async () => "tx-1"),
  batchGetDocsWithTx: vi.fn(async (_p: string, names: string[], _t: string) => {
    const out = new Map<string, FetchedDoc>();
    for (const name of names) {
      const id = name.split("/").pop()!;
      const parent = name.split("/").slice(-2, -1)[0];
      if (parent === "products" && products[id]) {
        out.set(name, { exists: true, data: { ...products[id] }, updateTime: "u1" });
      } else if (parent === "inventoryReservations" && reservations[id]) {
        out.set(name, { exists: true, data: { ...reservations[id] }, updateTime: "u1" });
      } else {
        out.set(name, { exists: false, data: {}, updateTime: null });
      }
    }
    return out;
  }),
  commitWithTx: vi.fn(async (_p: string, writes: unknown[], _t: string) => {
    if (abortOnce) {
      abortOnce = false;
      // Simulate the OTHER transaction committing while we abort.
      if (products["p1"]) products["p1"].reservedStock = 4;
      return false; // ABORTED → caller retries with fresh reads
    }
    committedWrites.push(...(writes as unknown[]));
    // Apply the writes to the fake store (products + reservations)
    for (const w of writes as Array<{
      update?: {
        name: string;
        fields: Record<string, { integerValue?: string; stringValue?: string }>;
      };
    }>) {
      if (!w?.update?.name) continue;
      const name = w.update.name;
      const id = name.split("/").pop()!;
      const parent = name.split("/").slice(-2, -1)[0];
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(w.update.fields)) {
        fields[k] = v.integerValue ? Number(v.integerValue) : (v.stringValue ?? null);
      }
      if (parent === "products") products[id] = { ...products[id], ...fields } as never;
      if (parent === "inventoryReservations")
        reservations[id] = { ...reservations[id], ...fields } as never;
    }
    return true;
  }),
  rollbackTransaction: vi.fn(async () => {}),
  commitWrites: vi.fn(async (_p: string, writes: unknown[]) => {
    committedWrites.push(...(writes as unknown[]));
  }),
  docPath: (projectId: string, segments: string[]) =>
    `projects/${projectId}/databases/(default)/documents/${segments.join("/")}`,
  toFsFields: (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number") out[k] = { integerValue: String(v) };
      else if (typeof v === "boolean") out[k] = { booleanValue: v };
      else if (v === null) out[k] = { nullValue: null };
      else if (Array.isArray(v))
        out[k] = { arrayValue: { values: v.map((x) => ({ stringValue: String(x) })) } };
      else out[k] = { stringValue: String(v) };
    }
    return out;
  },
}));

import {
  availableUnits,
  convertReservationToSold,
  releaseInventoryForOrder,
  reserveInventoryForOrder,
} from "../inventory.server";

const PID = "test-project";

beforeEach(() => {
  products = { p1: { stock: 5, reservedStock: 0, soldStock: 0 } };
  reservations = {};
  committedWrites = [];
  abortOnce = false;
});

describe("§2 available stock math", () => {
  it("available = stock − reserved − sold", () => {
    expect(availableUnits({ stock: 10, reservedStock: 3, soldStock: 2 })).toBe(5);
    expect(availableUnits({ stock: 1, reservedStock: 1, soldStock: 0 })).toBe(0);
  });
});

describe("§2 reservation — happy path", () => {
  it("reserves units atomically and materializes availableStock", async () => {
    const r = await reserveInventoryForOrder(PID, "o1", [{ productId: "p1", quantity: 3 }]);
    expect(r.ok).toBe(true);
    expect(r.state).toBe("reserved");
    expect(products["p1"].reservedStock).toBe(3);
    // stock stays (legacy total) — availability drops:
    expect(products["p1"].stock).toBe(5);
    expect(products["p1"].availableStock).toBe(2);
  });
});

describe("§2 the LAST-UNIT race — never oversell", () => {
  it("rejects a reservation that exceeds availability", async () => {
    const r = await reserveInventoryForOrder(PID, "o1", [{ productId: "p1", quantity: 6 }]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Insufficient stock/);
    expect(products["p1"].reservedStock).toBe(0); // nothing changed
  });

  it("a concurrent writer aborts our commit → we RETRY and see the shortage", async () => {
    // Another order commits 4 reserved units while our commit aborts;
    // our retry reads fresh data and must see the shortage.
    products["p1"] = { stock: 5, reservedStock: 0, soldStock: 0 };
    abortOnce = true; // first commit ABORTED (concurrent write won)
    const r = await reserveInventoryForOrder(PID, "o1", [{ productId: "p1", quantity: 4 }]);
    // After retry, only 1 unit remains — we must fail cleanly, never oversell.
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Insufficient stock/);
    expect(products["p1"].reservedStock).toBe(4); // not corrupted by us
  });

  it("two reservations summing above stock: the second fails", async () => {
    await reserveInventoryForOrder(PID, "o1", [{ productId: "p1", quantity: 3 }]); // ok
    const r2 = await reserveInventoryForOrder(PID, "o2", [{ productId: "p1", quantity: 3 }]); // only 2 left
    expect(r2.ok).toBe(false);
    expect(products["p1"].reservedStock).toBe(3);
  });
});

describe("§2 + §7 duplicate order event — idempotent reservation", () => {
  it("re-reserving the same order is a no-op success", async () => {
    const first = await reserveInventoryForOrder(PID, "o1", [{ productId: "p1", quantity: 2 }]);
    const before = products["p1"].reservedStock;
    const again = await reserveInventoryForOrder(PID, "o1", [{ productId: "p1", quantity: 2 }]);
    expect(again.ok).toBe(true);
    expect(again.state).toBe("reserved");
    expect(products["p1"].reservedStock).toBe(before); // NOT double-reserved
  });
});

describe("§2 lifecycle: release and sold conversion", () => {
  it("cancellation releases the reservation", async () => {
    await reserveInventoryForOrder(PID, "o1", [{ productId: "p1", quantity: 3 }]);
    const r = await releaseInventoryForOrder(PID, "o1");
    expect(r.ok).toBe(true);
    expect(products["p1"].reservedStock).toBe(0);
    expect(products["p1"].availableStock).toBe(5);
  });

  it("delivery converts reserved → sold", async () => {
    await reserveInventoryForOrder(PID, "o1", [{ productId: "p1", quantity: 3 }]);
    const r = await convertReservationToSold(PID, "o1");
    expect(r.ok).toBe(true);
    expect(products["p1"].reservedStock).toBe(0);
    expect(products["p1"].soldStock).toBe(3);
    expect(products["p1"].availableStock).toBe(2);
  });

  it("releasing an order with NO reservation is a safe no-op (legacy orders)", async () => {
    const r = await releaseInventoryForOrder(PID, "legacy-o9");
    expect(r.ok).toBe(true);
  });
});
