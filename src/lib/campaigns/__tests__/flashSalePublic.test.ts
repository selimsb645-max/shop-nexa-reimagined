/**
 * Public flash-sale view — sanitization + window/stock gating tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";
import { createFlashSale, getPublicActiveFlashSale, FLASH_SALES_COLLECTION } from "../flashSale.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8092;
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
beforeEach(() => { clearEmulatorStore(); });

function input(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    campaignId: "c_fs_1",
    startAt: now - 1000,
    endAt: now + 3_600_000,
    stockLimit: 10,
    perCustomerLimit: 2,
    originalPriceMinor: 500000,
    salePriceMinor: 350000,
    ...overrides,
  };
}

describe("public flash-sale view", () => {
  it("returns a sanitized in-window view", async () => {
    await createFlashSale("test-project", input());
    const pub = await getPublicActiveFlashSale("test-project", "c_fs_1");
    expect(pub).not.toBeNull();
    expect(pub!.salePriceMinor).toBe(350000);
    expect(pub!.stockRemaining).toBe(10);
    expect(pub!.perCustomerLimit).toBe(2);
    expect(pub!.endsAt).toBeGreaterThan(Date.now());
    // internal bookkeeping must not leak
    expect(Object.keys(pub!)).not.toContain("stockReserved");
    expect(Object.keys(pub!)).not.toContain("active");
  });

  it("hides future sales, past sales and sold-out sales", async () => {
    await createFlashSale("test-project", input({ campaignId: "c_future", startAt: Date.now() + 3_600_000, endAt: Date.now() + 7_200_000 }));
    expect(await getPublicActiveFlashSale("test-project", "c_future")).toBeNull();

    await createFlashSale("test-project", input({ campaignId: "c_past", startAt: Date.now() - 7_200_000, endAt: Date.now() - 3_600_000 }));
    expect(await getPublicActiveFlashSale("test-project", "c_past")).toBeNull();

    // sold out: reserve the entire stock directly in the store
    await createFlashSale("test-project", input({ campaignId: "c_sold", stockLimit: 5 }));
    const res = await fetch(`${BASE}/${FLASH_SALES_COLLECTION}/c_sold?updateMask.fieldPaths=stockReserved`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { stockReserved: { integerValue: 5 } } }),
    });
    expect(res.ok).toBe(true);
    expect(await getPublicActiveFlashSale("test-project", "c_sold")).toBeNull();
  });

  it("rejects invalid pricing at creation (price safety)", async () => {
    await expect(
      createFlashSale("test-project", input({ campaignId: "c_bad", salePriceMinor: 600000 })),
    ).rejects.toThrow(/flashsale\/validation/);
    await expect(
      createFlashSale("test-project", input({ campaignId: "c_bad2", stockLimit: 0 })),
    ).rejects.toThrow(/stockLimit/);
  });

  it("returns null for unknown campaigns", async () => {
    expect(await getPublicActiveFlashSale("test-project", "nope")).toBeNull();
  });
});
