/**
 * AVENTA SHOP — Money-Flow Audit: legacy walletTx migration double-credit
 * (Sep 7 2026)
 *
 * The v2 engine posts its own ledger entries for every order since the
 * workflow finance handler shipped. Importing a legacy "earning" for the
 * SAME order would credit the seller's v2-available balance a SECOND
 * time — directly withdrawable. The migration must skip every row tied
 * to an order that already has a v2 settlement, while non-order rows
 * (topups / adjustments) still migrate.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";

import { migrateLegacyWalletTx, getSellerWallet } from "../wallet.server";
import { querySellerLedger } from "../reconcile.server";
import { SELLER_LEDGER_COLLECTION } from "../ledger.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8092;
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents`;

const SELLER = "seller-mig";
const ADMIN = "admin-finance";

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

function fsValue(v: unknown): Record<string, unknown> {
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "boolean") return { booleanValue: v };
  if (v === null || v === undefined) return { nullValue: null };
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
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status}`);
}

beforeEach(async () => {
  await seedDoc(`sellers/${SELLER}`, {
    uid: SELLER,
    shopName: "Mig Shop",
    status: "approved",
  });
  await seedDoc(`users/${ADMIN}`, {
    uid: ADMIN,
    email: `${ADMIN}@test.local`,
    role: "admin",
    blocked: false,
    adminRole: "finance_admin",
  });
});

describe("migration: v2-covered orders are never double-imported", () => {
  it("skips legacy earning rows for orders that have a v2 settlement", async () => {
    const orderId = "ord-covered";

    // v2 engine already posted a settlement for this order
    await seedDoc(`settlements/st_${orderId}_${SELLER}`, {
      settlementId: `st_${orderId}_${SELLER}`,
      orderId,
      sellerId: SELLER,
      state: "PENDING",
      currency: "BDT",
      grossMinor: 50000,
      commissionMinor: 4000,
      shippingFeeMinor: 0,
      netMinor: 46000,
      commissionBps: 800,
      createdAt: 1757000000000,
      updatedAt: 1757000000000,
    });

    // legacy rail ALSO released an "earning" for the same order
    await seedDoc(`sellers/${SELLER}/walletTx/leg_1`, {
      type: "earning",
      amount: 460,
      status: "completed",
      orderId,
      createdAt: 1757000001000,
    });
    // …and a pre-v2 topup with NO order — this one must still migrate
    await seedDoc(`sellers/${SELLER}/walletTx/leg_2`, {
      type: "topup",
      amount: 100,
      status: "completed",
      orderId: null,
      createdAt: 1757000002000,
    });

    const out = await migrateLegacyWalletTx("test-project", ADMIN, SELLER);

    // the covered order's earning was SKIPPED, the topup migrated
    expect(out.migrated).toBe(1);
    expect(out.skippedV2Covered).toBe(1);

    // v2-available reflects ONLY the topup — the covered order's
    // economics live in the v2 hold already and are NOT re-credited
    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(10000);
    expect(wallet.totalEarnedMinor).toBe(10000);

    // no ORDER_CREDIT ledger entry was appended for the covered order
    const entries = await querySellerLedger("test-project", SELLER);
    const orderCredits = entries.filter(
      (e) => e.type === "ORDER_CREDIT" && e.reference === "legacy:leg_1",
    );
    expect(orderCredits).toHaveLength(0);
    const topupEntries = entries.filter((e) => e.reference === "legacy:leg_2");
    expect(topupEntries).toHaveLength(1);
  });

  it("still migrates pre-v2 rows when no v2 settlement exists (legacy-only sellers)", async () => {
    const orderId = "ord-pre-v2";
    // NO v2 settlement for this order — pure legacy history
    await seedDoc(`sellers/${SELLER}/walletTx/leg_1`, {
      type: "earning",
      amount: 460,
      status: "completed",
      orderId,
      createdAt: 1757000001000,
    });

    const out = await migrateLegacyWalletTx("test-project", ADMIN, SELLER);
    expect(out.migrated).toBe(1);
    expect(out.skippedV2Covered).toBe(0);

    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(46000);
  });

  it("is idempotent — a second run adds nothing", async () => {
    await seedDoc(`sellers/${SELLER}/walletTx/leg_1`, {
      type: "topup",
      amount: 100,
      status: "completed",
      orderId: null,
      createdAt: 1757000001000,
    });
    const first = await migrateLegacyWalletTx("test-project", ADMIN, SELLER);
    expect(first.migrated).toBe(1);
    const second = await migrateLegacyWalletTx("test-project", ADMIN, SELLER);
    expect(second.migrated).toBe(0);

    const res = await fetch(`${BASE}/${SELLER_LEDGER_COLLECTION}?pageSize=50`);
    const json = (await res.json()) as { documents?: unknown[] };
    expect((json.documents ?? []).length).toBe(1);
  });
});
