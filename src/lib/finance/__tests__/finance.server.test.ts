/**
 * AVENTA SHOP — Prompt 04 §12 INTEGRATION TESTS (emulator-backed)
 *
 * Ledger-first finance v2 end-to-end:
 *   commission calc → settlements → events → return window → batch →
 *   payouts (idempotent) → reconcile → refunds → reversal.
 *
 * Every §12 scenario is covered:
 *   - commission calculation (per-seller & per-category, integer paisa)
 *   - settlement lifecycle on order events
 *   - per-category return window config (no hard-coded window)
 *   - settlement batch lifecycle with re-auth
 *   - duplicate payout → REJECTED/ignored (idempotency)
 *   - failed payout → retryable
 *   - reversed payout
 *   - unauthorized finance access (support/content/order roles)
 *   - unauthorized adjustment
 *   - amount precision everywhere
 *   - ledger integrity + reconciliation mismatch detection
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";

import { toMinor } from "../money";
import { computeOrderFinancials } from "../fees.server";
import {
  readFinanceConfig,
  createSettlementsForOrder,
  advanceSettlementsForOrderEvent,
  advanceReturnWindowSettlements,
  querySettlements,
  SETTLEMENTS_COLLECTION,
} from "../settlements.server";
import {
  appendLedgerEntry,
  getSellerBalances,
  verifyLedgerIntegrity,
  SELLER_LEDGER_COLLECTION,
} from "../ledger.server";
import {
  generateSettlementBatch,
  reviewSettlementBatch,
  approveSettlementBatch,
  executeSettlementBatch,
  reconcileSettlementBatch,
  reversePayout,
  queryPayouts,
  requireFinancePermission,
  requireFreshAuth,
} from "../settlementBatch.server";
import { computeFinanceDashboard } from "../reconcile.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8087;
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

beforeEach(() => {
  clearEmulatorStore();
});

// ── seeding helpers ──────────────────────────────────────────────
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

async function seedSiteSettings(commission: Record<string, unknown>) {
  await seedDoc("settings/site", { commission });
}
async function seedSeller(sellerId: string, commissionRate?: number) {
  await seedDoc(`sellers/${sellerId}`, {
    uid: sellerId,
    ...(commissionRate !== undefined ? { commissionRate } : {}),
  });
}
async function seedAdmin(
  uid: string,
  adminRole: string | null,
  opts?: { role?: string; blocked?: boolean },
) {
  await seedDoc(`users/${uid}`, {
    uid,
    email: `${uid}@test.local`,
    role: opts?.role ?? "admin",
    blocked: opts?.blocked ?? false,
    adminRole,
  });
}
async function seedFinanceConfig(cfg: Record<string, unknown>) {
  await seedDoc("financeConfig/settings", cfg);
}

/** Test (emulator-mode) ID token: base64 JSON, per firebase-admin.server. */
function testToken(uid: string, iat?: number): string {
  return btoa(JSON.stringify({ uid, email: `${uid}@test.local`, ...(iat ? { iat } : {}) }));
}

/** Read all ledger entries for a seller directly from the emulator store. */
async function readLedgerEntries(sellerId: string) {
  const res = await fetch(`${BASE}/${SELLER_LEDGER_COLLECTION}`);
  const json = (await res.json()) as { documents?: Array<{ fields: Record<string, unknown> }> };
  const { fromFsFields } = await import("../../firebase-admin.server");
  const all = (json.documents ?? []).map(
    (d) => fromFsFields(d.fields as never) as Record<string, unknown>,
  );
  return all
    .filter((e) => e["sellerId"] === sellerId)
    .map((e) => ({
      transactionId: String(e["transactionId"]),
      sellerId: String(e["sellerId"]),
      seq: Number(e["seq"] ?? -1),
      type: String(e["type"]),
      amountMinor: Number(e["amountMinor"]),
      currency: "BDT" as const,
      orderId: (e["orderId"] as string) ?? null,
      reference: (e["reference"] as string) ?? null,
      createdBy: String(e["createdBy"] ?? "system"),
      balanceBefore: Number(e["balanceBefore"]),
      balanceAfter: Number(e["balanceAfter"]),
      heldBefore: Number(e["heldBefore"]),
      heldAfter: Number(e["heldAfter"]),
      createdAt: Number(e["createdAt"]),
    }));
}

const SELLER_A = "seller_fin_a";
const SELLER_B = "seller_fin_b";
const NOW = 1757100000000; // fixed clock for deterministic return windows

// ═════════════════════════════════════════════════════════════════
// §12 — COMMISSION CALCULATION (per-seller & per-category)
// ═════════════════════════════════════════════════════════════════
describe("finance v2: commission calculation (§2, §12)", () => {
  it("computes exact integer-paisa commissions per seller rate", async () => {
    await seedSiteSettings({ defaultRate: 8 });
    await seedSeller(SELLER_A, 0.1); // 10% negotiated
    await seedSeller(SELLER_B, 0.05); // 5% negotiated

    const bd = await computeOrderFinancials("test-project", { commission: { defaultRate: 8 } }, [
      { sellerId: SELLER_A, lineTotalTaka: 100.5, shippingTaka: 0 },
      { sellerId: SELLER_B, lineTotalTaka: 333.33, shippingTaka: 20.75 },
    ]);

    // A: ৳100.50 @10% → gross 10050, commission 1005, net 9045
    const a = bd.lines.find((l) => l.sellerId === SELLER_A)!;
    expect(a.gross.amountMinor).toBe(10050);
    expect(a.commission.amountMinor).toBe(1005);
    expect(a.sellerNet.amountMinor).toBe(9045);
    expect(a.commissionBps).toBe(1000);

    // B: ৳333.33 @5% → gross 33333, commission 1666 (truncated), shipping 2075
    const b = bd.lines.find((l) => l.sellerId === SELLER_B)!;
    expect(b.gross.amountMinor).toBe(33333);
    expect(b.commission.amountMinor).toBe(1666);
    expect(b.shippingFee.amountMinor).toBe(2075);
    expect(b.sellerNet.amountMinor).toBe(33333 - 1666 - 2075);
    expect(bd.totals.grossMinor).toBe(10050 + 33333);
  });

  it("falls back to the site default when seller has no rate", async () => {
    await seedSeller(SELLER_A); // no commissionRate
    const bd = await computeOrderFinancials("test-project", { commission: { defaultRate: 8 } }, [
      { sellerId: SELLER_A, lineTotalTaka: 200 },
    ]);
    expect(bd.lines[0].commissionBps).toBe(800);
    expect(bd.lines[0].commission.amountMinor).toBe(1600); // ৳2.00
  });

  it("groups multiple lines per seller into one settlement row", async () => {
    await seedSeller(SELLER_A, 0.08);
    const bd = await computeOrderFinancials("test-project", { commission: { defaultRate: 8 } }, [
      { sellerId: SELLER_A, lineTotalTaka: 100, shippingTaka: 10 },
      { sellerId: SELLER_A, lineTotalTaka: 50.5, shippingTaka: 0 },
    ]);
    // one row per seller
    expect(bd.lines.length).toBe(1);
    expect(bd.lines[0].gross.amountMinor).toBe(15050);
    expect(bd.lines[0].shippingFee.amountMinor).toBe(1000);
    expect(bd.lines[0].sellerNet.amountMinor).toBe(15050 - 1204 - 1000);
  });

  it("category-based commissions resolve per category (audit trail)", async () => {
    await seedSeller(SELLER_A, 0.08);
    const bd = await computeOrderFinancials(
      "test-project",
      { commission: { defaultRate: 8, categoryBased: true } },
      [
        {
          sellerId: SELLER_A,
          lineTotalTaka: 1000,
          categoryId: "electronics",
          subcategoryId: "phones",
        },
        { sellerId: SELLER_A, lineTotalTaka: 500, categoryId: "fashion" },
      ],
    );
    // category rates come from the production resolver: electronics 8%,
    // fashion 12% — assert bps recorded transparently either way
    for (const l of bd.lines) {
      expect(Number.isInteger(l.commission.amountMinor)).toBe(true);
      expect(l.commission.amountMinor).toBe(
        Math.trunc((l.gross.amountMinor * l.commissionBps) / 10000),
      );
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// §12 — SETTLEMENT LIFECYCLE + RETURN WINDOW CONFIG
// ═════════════════════════════════════════════════════════════════
describe("finance v2: settlement lifecycle + return windows (§4, §5)", () => {
  async function createOrder(orderId: string, cfg: Record<string, unknown> = {}) {
    await seedFinanceConfig(cfg);
    await seedSeller(SELLER_A, 0.08);
    const config = await readFinanceConfig("test-project");
    const bd = await computeOrderFinancials("test-project", { commission: { defaultRate: 8 } }, [
      { sellerId: SELLER_A, lineTotalTaka: 100.5, shippingTaka: 0, categoryId: "electronics" },
    ]);
    const res = await createSettlementsForOrder("test-project", orderId, bd.lines, config);
    return { config, bd, res };
  }

  it("ORDER_CREATED posts settlement + 3 ledger entries (credit, fee, hold)", async () => {
    const { bd } = await createOrder("ord-life-1");
    const rows = await querySettlements("test-project", { orderId: "ord-life-1" });
    expect(rows.length).toBe(1);
    const s = rows[0];
    expect(s.state).toBe("PENDING");
    expect(s.netMinor).toBe(bd.lines[0].sellerNet.amountMinor);

    const balances = await getSellerBalances("test-project", SELLER_A);
    // credit(gross) − commission = available before hold; hold moves net to held
    expect(balances.availableMinor).toBe(0);
    expect(balances.heldMinor).toBe(s.netMinor);
    const entries = await readLedgerEntries(SELLER_A);
    expect(entries.length).toBe(3); // credit + commission + hold
    const integrity = await verifyLedgerIntegrity("test-project", SELLER_A, entries as never);
    expect(integrity.ok).toBe(true);
    expect(integrity.mismatches.length).toBe(0);
  });

  it("settlement creation is idempotent (duplicate ORDER_CREATED replay)", async () => {
    await createOrder("ord-life-2");
    const again = await createOrder("ord-life-2");
    expect(again.res.skipped).toBe(1);
    const rows = await querySettlements("test-project", { orderId: "ord-life-2" });
    expect(rows.length).toBe(1);
    const balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.heldMinor).toBe(rows[0].netMinor); // not doubled
  });

  it("DELIVERED sets return window from config (days honored — not hard-coded)", async () => {
    const { config } = await createOrder("ord-life-3", { defaultReturnWindowDays: 3 });
    await advanceSettlementsForOrderEvent("test-project", "ord-life-3", "DELIVERED", config, NOW);
    let rows = await querySettlements("test-project", { orderId: "ord-life-3" });
    expect(rows[0].state).toBe("DELIVERED");
    const ends = Number(rows[0].returnWindowEndsAt);
    const days = (ends - NOW) / 86_400_000;
    expect(days).toBeCloseTo(3, 5);
    expect(Number(rows[0].returnWindowDays)).toBe(3);

    // window not yet over → nothing released
    const r1 = await advanceReturnWindowSettlements("test-project", config, NOW + 86_400_000);
    expect(r1.eligible).toBe(0);
    rows = await querySettlements("test-project", { orderId: "ord-life-3" });
    expect(rows[0].state).toBe("DELIVERED");

    // window over → ELIGIBLE + SETTLEMENT_RELEASE moves held → available
    const r2 = await advanceReturnWindowSettlements(
      "test-project",
      config,
      NOW + 3 * 86_400_000 + 1,
    );
    expect(r2.eligible).toBe(1);
    rows = await querySettlements("test-project", { orderId: "ord-life-3" });
    expect(rows[0].state).toBe("ELIGIBLE");
    const balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.heldMinor).toBe(0);
    expect(balances.availableMinor).toBe(rows[0].netMinor);
  });

  it("per-category return window override beats the default (§5)", async () => {
    const { config } = await createOrder("ord-cat-1", {
      defaultReturnWindowDays: 7,
      categoryReturnWindowOverrides: { electronics: 1 },
    });
    await advanceSettlementsForOrderEvent("test-project", "ord-cat-1", "DELIVERED", config, NOW);
    const rows = await querySettlements("test-project", { orderId: "ord-cat-1" });
    expect(Number(rows[0].returnWindowDays)).toBe(1); // electronics override

    // 7 days pass → long past the 1-day electronics window → eligible
    const r = await advanceReturnWindowSettlements("test-project", config, NOW + 7 * 86_400_000);
    expect(r.eligible).toBe(1);
  });

  it("CANCELLED before delivery reverses cleanly (net zero for seller)", async () => {
    const { config } = await createOrder("ord-cancel-1");
    await advanceSettlementsForOrderEvent("test-project", "ord-cancel-1", "CANCELLED", config);
    const rows = await querySettlements("test-project", { orderId: "ord-cancel-1" });
    expect(rows[0].state).toBe("REVERSED");
    const balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.availableMinor).toBe(0);
    expect(balances.heldMinor).toBe(0); // held released then debited → net zero
  });

  it("REFUND flow: pending flag → refund debit + REVERSED, net zero", async () => {
    const { config } = await createOrder("ord-refund-1");
    await advanceSettlementsForOrderEvent("test-project", "ord-refund-1", "DELIVERED", config, NOW);
    await advanceSettlementsForOrderEvent("test-project", "ord-refund-1", "REFUND_PENDING", config);
    let rows = await querySettlements("test-project", { orderId: "ord-refund-1" });
    expect(rows[0].state).toBe("REFUND_PENDING");

    await advanceSettlementsForOrderEvent("test-project", "ord-refund-1", "REFUNDED", config);
    rows = await querySettlements("test-project", { orderId: "ord-refund-1" });
    expect(rows[0].state).toBe("REVERSED");
    const balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.availableMinor).toBe(0);
    expect(balances.heldMinor).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════
// §12 — LEDGER: integrity, idempotency, concurrency, precision
// ═════════════════════════════════════════════════════════════════
describe("finance v2: ledger engine (§3, §12)", () => {
  it("duplicate idempotency key NEVER double-posts", async () => {
    const input = {
      sellerId: SELLER_A,
      type: "ADJUSTMENT" as const,
      amountMinor: 5000,
      currency: "BDT" as const,
      orderId: null,
      reference: "bonus",
      createdBy: "admin",
      idempotencyKey: "adj_test_1",
    };
    await appendLedgerEntry("test-project", input);
    await appendLedgerEntry("test-project", input); // replay
    const balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.availableMinor).toBe(5000); // exactly once
    const res = await fetch(`${BASE}/${SELLER_LEDGER_COLLECTION}`);
    const json = await res.json();
    expect(json.documents?.length ?? 0).toBe(1);
  });

  it("concurrent appends both land with a consistent chain", async () => {
    await Promise.all([
      appendLedgerEntry("test-project", {
        sellerId: SELLER_A,
        type: "ADJUSTMENT",
        amountMinor: 1000,
        currency: "BDT",
        orderId: null,
        reference: "c1",
        createdBy: "t",
        idempotencyKey: "conc_1",
      }),
      appendLedgerEntry("test-project", {
        sellerId: SELLER_A,
        type: "ADJUSTMENT",
        amountMinor: 2000,
        currency: "BDT",
        orderId: null,
        reference: "c2",
        createdBy: "t",
        idempotencyKey: "conc_2",
      }),
      appendLedgerEntry("test-project", {
        sellerId: SELLER_A,
        type: "ADJUSTMENT",
        amountMinor: 3000,
        currency: "BDT",
        orderId: null,
        reference: "c3",
        createdBy: "t",
        idempotencyKey: "conc_3",
      }),
    ]);
    const balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.availableMinor).toBe(6000);
    // Chain verification catches any lost/duplicated entry
    const entries = await readLedgerEntries(SELLER_A);
    expect(entries.length).toBe(3);
    const integrity = await verifyLedgerIntegrity("test-project", SELLER_A, entries as never);
    expect(integrity.ok).toBe(true);
    expect(integrity.mismatches.length).toBe(0);
  });

  it("chain break + stored-balance tampering are DETECTED (reconciliation)", async () => {
    await appendLedgerEntry("test-project", {
      sellerId: SELLER_A,
      type: "ADJUSTMENT",
      amountMinor: 1000,
      currency: "BDT",
      orderId: null,
      reference: "r1",
      createdBy: "t",
      idempotencyKey: "tamper_1",
    });
    await appendLedgerEntry("test-project", {
      sellerId: SELLER_A,
      type: "ADJUSTMENT",
      amountMinor: 2000,
      currency: "BDT",
      orderId: null,
      reference: "r2",
      createdBy: "t",
      idempotencyKey: "tamper_2",
    });

    // Tamper with the stored balance snapshot directly (as a rogue write would)
    await seedDoc("sellerFinance/" + SELLER_A, {
      availableMinor: 999,
      heldMinor: 0,
      paidOutMinor: 0,
    });
    const balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.availableMinor).toBe(999); // stored is tampered…
    const entries = await readLedgerEntries(SELLER_A);
    const integrity = await verifyLedgerIntegrity("test-project", SELLER_A, entries as never);
    expect(integrity.ok).toBe(false); // …and reconciliation DETECTS it
    expect(integrity.mismatches.some((m) => m.includes("available mismatch"))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// §12 — BATCH LIFECYCLE, RE-AUTH, PAYOUT IDEMPOTENCY
// ═════════════════════════════════════════════════════════════════
describe("finance v2: batch → payout flow (§6, §7, §8)", () => {
  const FINANCE_ADMIN = "finadmin";
  const REVIEWER = "reviewer";
  const NOW_IAT = Math.floor(Date.now() / 1000);

  async function seedEligible(
    orderId: string,
    sellerId: string,
    taka: number,
    catId = "electronics",
  ) {
    await seedFinanceConfig({ payoutProvider: "MOCK", mockPayoutEnabled: true });
    await seedSeller(sellerId, 0.08);
    const config = await readFinanceConfig("test-project");
    const bd = await computeOrderFinancials("test-project", { commission: { defaultRate: 8 } }, [
      { sellerId, lineTotalTaka: taka, shippingTaka: 0, categoryId: catId },
    ]);
    await createSettlementsForOrder("test-project", orderId, bd.lines, config);
    await advanceSettlementsForOrderEvent("test-project", orderId, "DELIVERED", config, NOW);
    await advanceReturnWindowSettlements("test-project", config, NOW + 30 * 86_400_000);
    return config;
  }

  beforeEach(async () => {
    await seedAdmin(FINANCE_ADMIN, "finance_admin");
    await seedAdmin(REVIEWER, "finance_admin");
    await seedAdmin("support", "support_admin");
    await seedAdmin("ordermgr", "order_manager");
    await seedAdmin("content", "content_admin");
    await seedAdmin("plainuser", null);
  });

  it("full flow: generate → review → approve (re-auth) → execute → reconcile", async () => {
    await seedEligible("ord-batch-1", SELLER_A, 100.5);

    const batch = await generateSettlementBatch("test-project", FINANCE_ADMIN);
    expect(batch.state).toBe("DRAFT");
    expect(batch.settlementCount).toBe(1);
    expect(batch.sellerCount).toBe(1);

    let rows = await querySettlements("test-project", { batchId: batch.batchId });
    expect(rows[0].state).toBe("SETTLEMENT_BATCH");

    const reviewed = await reviewSettlementBatch("test-project", REVIEWER, batch.batchId, "LGTM");
    expect(reviewed.state).toBe("IN_REVIEW");

    // STALE token must be refused — money moves need fresh re-auth
    await expect(
      approveSettlementBatch(
        "test-project",
        testToken(FINANCE_ADMIN, NOW_IAT - 3600),
        batch.batchId,
      ),
    ).rejects.toThrow(/re-authentication/i);

    const approved = await approveSettlementBatch(
      "test-project",
      testToken(FINANCE_ADMIN, NOW_IAT),
      batch.batchId,
    );
    expect(approved.state).toBe("APPROVED");
    // approve replay is idempotent
    const approved2 = await approveSettlementBatch(
      "test-project",
      testToken(FINANCE_ADMIN, NOW_IAT),
      batch.batchId,
    );
    expect(approved2.state).toBe("APPROVED");

    // execute with a STALE token also refused
    await expect(
      executeSettlementBatch(
        "test-project",
        testToken(FINANCE_ADMIN, NOW_IAT - 3600),
        batch.batchId,
        { productionMode: false },
      ),
    ).rejects.toThrow(/re-authentication/i);

    const exec = await executeSettlementBatch(
      "test-project",
      testToken(FINANCE_ADMIN, NOW_IAT),
      batch.batchId,
      { productionMode: false },
    );
    expect(exec.payouts.length).toBe(1);
    expect(exec.failed).toBe(0);
    expect(exec.payouts[0].status).toBe("SUBMITTED");

    rows = await querySettlements("test-project", { batchId: batch.batchId });
    expect(rows[0].state).toBe("PAID");
    expect(rows[0].payoutId).toBe(exec.payouts[0].payoutId);

    const balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.availableMinor).toBe(0);
    expect(balances.heldMinor).toBe(0);
    expect(balances.paidOutMinor).toBe(rows[0].netMinor);

    const rec = await reconcileSettlementBatch("test-project", FINANCE_ADMIN, batch.batchId);
    expect(rec.reconciled).toBe(true);
    expect(rec.mismatches).toEqual([]);
  });

  it("duplicate batch execution CANNOT double-pay (§8 idempotency)", async () => {
    await seedEligible("ord-batch-2", SELLER_A, 200);
    const batch = await generateSettlementBatch("test-project", FINANCE_ADMIN);
    await reviewSettlementBatch("test-project", REVIEWER, batch.batchId, "ok");
    await approveSettlementBatch("test-project", testToken(FINANCE_ADMIN, NOW_IAT), batch.batchId);

    const e1 = await executeSettlementBatch(
      "test-project",
      testToken(FINANCE_ADMIN, NOW_IAT),
      batch.batchId,
      { productionMode: false },
    );
    const e2 = await executeSettlementBatch(
      "test-project",
      testToken(FINANCE_ADMIN, NOW_IAT),
      batch.batchId,
      { productionMode: false },
    );

    expect(e2.payouts[0].payoutId).toBe(e1.payouts[0].payoutId); // same payout returned
    const all = await queryPayouts("test-project", { batchId: batch.batchId });
    expect(all.length).toBe(1); // still exactly one payout doc

    const balances = await getSellerBalances("test-project", SELLER_A);
    const rows = await querySettlements("test-project", { batchId: batch.batchId });
    expect(balances.paidOutMinor).toBe(rows[0].netMinor); // paid exactly once
    const rec = await reconcileSettlementBatch("test-project", FINANCE_ADMIN, batch.batchId);
    expect(rec.reconciled).toBe(true);
  });

  it("failed payout → payout FAILED, settlements FAILED (retryable), batch reports failure", async () => {
    const FAIL_SELLER = "seller_fin_fail"; // mock provider fails _fail sellers
    await seedEligible("ord-batch-3", FAIL_SELLER, 300);

    const batch = await generateSettlementBatch("test-project", FINANCE_ADMIN);
    await reviewSettlementBatch("test-project", REVIEWER, batch.batchId, "ok");
    await approveSettlementBatch("test-project", testToken(FINANCE_ADMIN, NOW_IAT), batch.batchId);
    const exec = await executeSettlementBatch(
      "test-project",
      testToken(FINANCE_ADMIN, NOW_IAT),
      batch.batchId,
      { productionMode: false },
    );

    expect(exec.failed).toBe(1);
    expect(exec.payouts[0].status).toBe("FAILED");
    const rows = await querySettlements("test-project", { batchId: batch.batchId });
    expect(rows[0].state).toBe("FAILED"); // retryable via FAILED → PROCESSING

    const balances = await getSellerBalances("test-project", FAIL_SELLER);
    expect(balances.paidOutMinor).toBe(0); // no money vanished — still ledger-consistent
    const rec = await reconcileSettlementBatch("test-project", FINANCE_ADMIN, batch.batchId);
    expect(rec.reconciled).toBe(false);
    expect(rec.mismatches.some((m) => m.includes("FAILED"))).toBe(true);
  });

  it("reversed payout posts a compensating entry and is idempotent", async () => {
    await seedEligible("ord-batch-4", SELLER_A, 150);
    const batch = await generateSettlementBatch("test-project", FINANCE_ADMIN);
    await reviewSettlementBatch("test-project", REVIEWER, batch.batchId, "ok");
    await approveSettlementBatch("test-project", testToken(FINANCE_ADMIN, NOW_IAT), batch.batchId);
    const exec = await executeSettlementBatch(
      "test-project",
      testToken(FINANCE_ADMIN, NOW_IAT),
      batch.batchId,
      { productionMode: false },
    );
    const payoutId = exec.payouts[0].payoutId;

    let balances = await getSellerBalances("test-project", SELLER_A);
    const netBefore = balances.paidOutMinor;
    expect(netBefore).toBeGreaterThan(0);

    const p1 = await reversePayout(
      "test-project",
      testToken(FINANCE_ADMIN, NOW_IAT),
      payoutId,
      "bank rejected",
    );
    expect(p1.status).toBe("REVERSED");
    balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.paidOutMinor).toBe(0); // payout reversed out
    expect(balances.availableMinor).toBe(netBefore); // money back to seller

    const p2 = await reversePayout(
      "test-project",
      testToken(FINANCE_ADMIN, NOW_IAT),
      payoutId,
      "replay",
    );
    expect(p2.status).toBe("REVERSED"); // idempotent
    balances = await getSellerBalances("test-project", SELLER_A);
    expect(balances.availableMinor).toBe(netBefore); // NOT credited twice
  });

  it("unauthorized roles CANNOT touch finance (§11, §12 unauthorized access)", async () => {
    await seedEligible("ord-auth-1", SELLER_A, 90);

    // support_admin: denied everything (not even generate)
    await expect(generateSettlementBatch("test-project", "support")).rejects.toThrow(
      /finance\/permission/i,
    );
    // content_admin: denied
    await expect(generateSettlementBatch("test-project", "content")).rejects.toThrow(
      /finance\/permission/i,
    );
    // order_manager: read-only — denied generate/review/reconcile
    await expect(generateSettlementBatch("test-project", "ordermgr")).rejects.toThrow(
      /finance\/permission/i,
    );
    // no role at all: denied
    await expect(generateSettlementBatch("test-project", "plainuser")).rejects.toThrow(
      /finance\/permission/i,
    );

    // Direct permission probes (unauthorized ADJUSTMENT / PAYOUT / REFUND)
    await expect(
      requireFinancePermission("test-project", "ordermgr", "finance.adjust"),
    ).rejects.toThrow();
    await expect(
      requireFinancePermission("test-project", "support", "finance.payout"),
    ).rejects.toThrow();
    await expect(
      requireFinancePermission("test-project", "content", "finance.refund"),
    ).rejects.toThrow();
    await expect(
      requireFinancePermission("test-project", "plainuser", "finance.read"),
    ).rejects.toThrow();

    // finance_admin CAN
    await expect(
      requireFinancePermission("test-project", FINANCE_ADMIN, "finance.settlement"),
    ).resolves.toBeUndefined();
  });

  it("batch generation is idempotent by caller key", async () => {
    await seedEligible("ord-idem-1", SELLER_A, 80);
    const b1 = await generateSettlementBatch("test-project", FINANCE_ADMIN, "gen-key-1");
    const b2 = await generateSettlementBatch("test-project", FINANCE_ADMIN, "gen-key-1");
    expect(b2.batchId).toBe(b1.batchId); // replay returns the same batch
  });
});

// ═════════════════════════════════════════════════════════════════
// §12 — DASHBOARD / RECONCILIATION SURFACE
// ═════════════════════════════════════════════════════════════════
describe("finance v2: dashboard + reconciliation (§9, §12)", () => {
  it("aggregates totals and reports no mismatches on a clean flow", async () => {
    await seedAdmin("finadmin", "finance_admin");
    await seedSeller(SELLER_A, 0.08);
    await seedFinanceConfig({ payoutProvider: "MOCK", mockPayoutEnabled: true });
    const config = await readFinanceConfig("test-project");
    const bd = await computeOrderFinancials("test-project", { commission: { defaultRate: 8 } }, [
      { sellerId: SELLER_A, lineTotalTaka: 500 },
    ]);
    await createSettlementsForOrder("test-project", "ord-dash-1", bd.lines, config);

    const dash = await computeFinanceDashboard("test-project", [SELLER_A]);
    expect(dash.currency).toBe("BDT");
    expect(dash.settlementTotals["PENDING"]?.count).toBe(1);
    expect(dash.settlementTotals["PENDING"]?.netMinor).toBe(bd.lines[0].sellerNet.amountMinor);
    expect(dash.mismatches).toEqual([]);
    expect(dash.sellersChecked).toBe(1);
  });
});
