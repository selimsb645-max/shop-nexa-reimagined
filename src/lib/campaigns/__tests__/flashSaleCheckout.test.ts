/**
 * Flash-sale reserve→order integration tests.
 *
 * Covers the three new seams of the checkout integration:
 *   1. createFlashSale product binding (productId) + validation.
 *   2. getActiveFlashSaleForProduct — the checkout-side lookup
 *      (window / stock / legacy-doc gating).
 *   3. The order-workflow compensation path: a CANCELLED or
 *      DELIVERY_FAILED order event releases the flash-sale stock
 *      pool AND the per-customer purchase counter.
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
  getActiveFlashSaleForProduct,
  getFlashSale,
  reserveFlashSaleStock,
  FLASH_SALES_COLLECTION,
} from "../flashSale.server";
import { dispatchOrderEvent } from "../../orderWorkflow.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8093;
const PID = "test-project";
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/${PID}/databases/(default)/documents`;

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
    campaignId: "c_fs_1",
    productId: "p_wireless_buds",
    startAt: now - 1000,
    endAt: now + 3_600_000,
    stockLimit: 10,
    perCustomerLimit: 2,
    originalPriceMinor: 500000,
    salePriceMinor: 350000,
    ...overrides,
  };
}

describe("flash-sale product binding", () => {
  it("persists productId on the sale doc", async () => {
    await createFlashSale(PID, input());
    const doc = await getFlashSale(PID, "c_fs_1");
    expect(doc?.productId).toBe("p_wireless_buds");
  });

  it("rejects an empty-string productId (a sale must sell a real product)", async () => {
    await expect(
      createFlashSale(PID, input({ campaignId: "c_bad", productId: "   " })),
    ).rejects.toThrow(/flashsale\/validation/);
  });

  it("legacy sales without productId are still valid (back-compat)", async () => {
    const { productId: _drop, ...legacy } = input({ campaignId: "c_legacy" });
    await createFlashSale(PID, legacy);
    const doc = await getFlashSale(PID, "c_legacy");
    expect(doc?.productId).toBeNull();
  });
});

describe("checkout-side lookup: getActiveFlashSaleForProduct", () => {
  it("finds the active in-window sale for the product", async () => {
    await createFlashSale(PID, input());
    const sale = await getActiveFlashSaleForProduct(PID, "p_wireless_buds");
    expect(sale).not.toBeNull();
    expect(sale!.campaignId).toBe("c_fs_1");
    expect(sale!.salePriceMinor).toBe(350000);
  });

  it("returns null for another product", async () => {
    await createFlashSale(PID, input());
    expect(await getActiveFlashSaleForProduct(PID, "p_other")).toBeNull();
  });

  it("returns null for future, past, and inactive sales", async () => {
    await createFlashSale(
      PID,
      input({
        campaignId: "c_future",
        startAt: Date.now() + 3_600_000,
        endAt: Date.now() + 7_200_000,
      }),
    );
    await createFlashSale(
      PID,
      input({
        campaignId: "c_past",
        startAt: Date.now() - 7_200_000,
        endAt: Date.now() - 3_600_000,
      }),
    );
    // inactive sale (active:false) written directly into the store
    await fetch(`${BASE}/${FLASH_SALES_COLLECTION}/c_off`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fields: {
          campaignId: { stringValue: "c_off" },
          productId: { stringValue: "p_wireless_buds" },
          startAt: { integerValue: Date.now() - 1000 },
          endAt: { integerValue: Date.now() + 3_600_000 },
          stockTotal: { integerValue: 5 },
          stockReserved: { integerValue: 0 },
          perCustomerLimit: { integerValue: 2 },
          salePriceMinor: { integerValue: 350000 },
          originalPriceMinor: { integerValue: 500000 },
          active: { booleanValue: false },
        },
      }),
    });
    expect(await getActiveFlashSaleForProduct(PID, "p_wireless_buds")).toBeNull();
  });

  it("returns null when the product's sale is sold out", async () => {
    await createFlashSale(PID, input({ stockLimit: 3 }));
    const res = await fetch(
      `${BASE}/${FLASH_SALES_COLLECTION}/c_fs_1?updateMask.fieldPaths=stockReserved`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields: { stockReserved: { integerValue: 3 } } }),
      },
    );
    expect(res.ok).toBe(true);
    expect(await getActiveFlashSaleForProduct(PID, "p_wireless_buds")).toBeNull();
  });

  it("serves the soonest-ending sale when several are active", async () => {
    await createFlashSale(PID, input({ campaignId: "c_late", endAt: Date.now() + 7_200_000 }));
    await createFlashSale(PID, input({ campaignId: "c_soon", endAt: Date.now() + 1_800_000 }));
    const sale = await getActiveFlashSaleForProduct(PID, "p_wireless_buds");
    expect(sale!.campaignId).toBe("c_soon");
  });

  it("ignores legacy sales without a productId", async () => {
    const { productId: _drop, ...legacy } = input({ campaignId: "c_legacy2" });
    await createFlashSale(PID, legacy);
    expect(await getActiveFlashSaleForProduct(PID, "p_wireless_buds")).toBeNull();
  });
});

describe("reserve→order compensation via the order workflow", () => {
  const ctx = (claims: Array<{ campaignId: string; productId: string; quantity: number }>) => ({
    customerId: "cust_1",
    sellerIds: ["seller_1"],
    items: [{ productId: "p_wireless_buds", quantity: 2 }],
    flashSaleClaims: claims.length > 0 ? claims : undefined,
    total: 0,
  });

  it("a CANCELLED order releases flash-sale stock and the purchase counter", async () => {
    await createFlashSale(PID, input());
    const r = await reserveFlashSaleStock(PID, {
      campaignId: "c_fs_1",
      customerId: "cust_1",
      quantity: 2,
    });
    expect(r.ok).toBe(true);
    expect((await getFlashSale(PID, "c_fs_1"))!.stockReserved).toBe(2);

    const res = await dispatchOrderEvent(
      PID,
      "o1",
      "CANCELLED",
      ctx([{ campaignId: "c_fs_1", productId: "p_wireless_buds", quantity: 2 }]),
    );
    expect(res.handlersRun).toContain("flashSale");

    const sale = await getFlashSale(PID, "c_fs_1");
    expect(sale!.stockReserved).toBe(0);

    // Counter reset → the same customer can buy the sale again.
    const again = await reserveFlashSaleStock(PID, {
      campaignId: "c_fs_1",
      customerId: "cust_1",
      quantity: 2,
    });
    expect(again.ok).toBe(true);
  });

  it("a DELIVERY_FAILED order releases flash-sale stock too", async () => {
    await createFlashSale(PID, input({ stockLimit: 4 }));
    await reserveFlashSaleStock(PID, { campaignId: "c_fs_1", customerId: "cust_1", quantity: 1 });

    const res = await dispatchOrderEvent(
      PID,
      "o2",
      "DELIVERY_FAILED",
      ctx([{ campaignId: "c_fs_1", productId: "p_wireless_buds", quantity: 1 }]),
    );
    expect(res.handlersRun).toContain("flashSale");
    expect((await getFlashSale(PID, "c_fs_1"))!.stockReserved).toBe(0);
  });

  it("orders without flash-sale claims dispatch unchanged (handler no-ops)", async () => {
    await createFlashSale(PID, input());
    const res = await dispatchOrderEvent(PID, "o3", "CANCELLED", ctx([]));
    expect(res.handlersRun).toContain("flashSale");
    expect((await getFlashSale(PID, "c_fs_1"))!.stockReserved).toBe(0);
  });

  it("duplicate CANCELLED dispatch never double-releases (idempotent)", async () => {
    await createFlashSale(PID, input({ stockLimit: 5 }));
    // Another customer holds 1 reserved unit — it must survive.
    await reserveFlashSaleStock(PID, { campaignId: "c_fs_1", customerId: "cust_2", quantity: 1 });
    await reserveFlashSaleStock(PID, { campaignId: "c_fs_1", customerId: "cust_1", quantity: 2 });

    const claims = [{ campaignId: "c_fs_1", productId: "p_wireless_buds", quantity: 2 }];
    const first = await dispatchOrderEvent(PID, "o4", "CANCELLED", ctx(claims));
    const second = await dispatchOrderEvent(PID, "o4", "CANCELLED", ctx(claims));

    expect(first.ok).toBe(true);
    expect(second.skipped).toBe("already-processed");
    // cust_1's 2 units released once; cust_2's 1 unit untouched.
    expect((await getFlashSale(PID, "c_fs_1"))!.stockReserved).toBe(1);
  });
});
