/**
 * AVENTA SHOP — Canonical Rail Freeze tests (Sep 7, 2026)
 *
 * Locks the Seller Finance v2 canonical-rail migration invariants:
 *  A. Legacy withdrawals FROZEN — no new legacy money movement possible
 *  B. In-flight legacy withdrawal resolution stays alive, v2-shaped
 *     withdrawals can NEVER be processed by the legacy writer
 *  C. v2-covered orders are never credited on the legacy rail
 *     (single- / batch-release + refund reversal)
 *  D. Cross-rail reconciliation: double-credit detection, report-only
 *  E. Withdrawal state migration report (shared collection, both shapes)
 *  F. v2 withdrawal path unaffected — the live rail still works
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";

let emulatorServer: Server;
const EMULATOR_PORT = 8097;
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

// ── seeding helpers ─────────────────────────────────────────────────
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

function decodeValue(v: Record<string, unknown>): unknown {
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.mapValue !== undefined) {
    const fields = (v.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    return Object.fromEntries(
      Object.entries(fields).map(([k, x]) => [k, decodeValue(x as Record<string, unknown>)]),
    );
  }
  return undefined;
}

async function getDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { fields?: Record<string, unknown> };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(json.fields ?? {})) {
    out[k] = decodeValue(v as Record<string, unknown>);
  }
  return out;
}

async function listDocs(
  path: string,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    documents?: Array<{ name: string; fields?: Record<string, unknown> }>;
  };
  return (json.documents ?? []).map((d) => {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d.fields ?? {})) {
      data[k] = decodeValue(v as Record<string, unknown>);
    }
    return { id: d.name.split("/").pop()!, data };
  });
}

const SELLER_A = "sellerA_canonrail";
const SELLER_B = "sellerB_canonrail";
const ORDER_L = "order_legacy_only"; // pre-v2 order, no v2 settlement
const ORDER_V2 = "order_v2_covered"; // settled by the v2 engine
const ORDER_DC = "order_double_credit"; // legacy-released AND v2-covered (historic bug)

async function seedSellerOrder(
  sellerId: string,
  orderId: string,
  settlementStatus: string,
  earnings: number,
) {
  await seedDoc(`sellers/${sellerId}/orders/${orderId}`, {
    orderId,
    uid: sellerId,
    status: "delivered",
    settlement: {
      settlementStatus,
      eligibleSettlementDate: Date.now() - 1000,
      sellerNetEarnings: earnings,
      sellerSubtotal: earnings + 100,
      updatedAt: Date.now(),
    },
  });
}

async function seedV2Settlement(sellerId: string, orderId: string, netMinor: number) {
  await seedDoc(`settlements/st_${orderId}_${sellerId}`, {
    settlementId: `st_${orderId}_${sellerId}`,
    orderId,
    sellerId,
    state: "DELIVERED",
    currency: "BDT",
    grossMinor: netMinor + 1000,
    commissionMinor: 1000,
    shippingFeeMinor: 0,
    netMinor,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function seedLegacyPendingWithdrawal(sellerId: string, withdrawalId: string, amount: number) {
  await seedDoc(`sellers/${sellerId}/withdrawals/${withdrawalId}`, {
    amount,
    method: "bkash",
    status: "pending",
    destination: "017*****678",
    requestedAt: Date.now() - 5000,
  });
  await seedDoc(`sellers/${sellerId}/walletTx/hold_${withdrawalId}`, {
    type: "withdrawal",
    amount: -amount,
    status: "pending",
    withdrawalId,
    createdAt: Date.now() - 5000,
  });
}

// ════════════════════════════════════════════════════════════════════
// A. LEGACY RAIL FROZEN — no new money movement
// ════════════════════════════════════════════════════════════════════

describe("A. Legacy withdrawal rail is FROZEN", () => {
  beforeEach(async () => {
    await seedDoc(`sellers/${SELLER_A}`, { uid: SELLER_A, shopName: "A", status: "approved" });
    await seedDoc(`sellers/${SELLER_A}/walletTx/tx_e1`, {
      type: "earning",
      amount: 1000,
      status: "completed",
      createdAt: Date.now(),
    });
  });

  it("requestSettlementWithdrawal throws the frozen error and writes NOTHING (even with sufficient balance)", async () => {
    const { requestSettlementWithdrawal } = await import("../../settlement.server");
    await expect(
      requestSettlementWithdrawal({
        uid: SELLER_A,
        amount: 500,
        method: "bkash",
        destination: "01712345678",
      }),
    ).rejects.toThrow(/legacy-rail-frozen/);

    expect(await listDocs(`sellers/${SELLER_A}/withdrawals`)).toHaveLength(0);
    const txs = await listDocs(`sellers/${SELLER_A}/walletTx`);
    expect(txs.every((t) => t.data.status !== "pending")).toBe(true);
  });

  it("the freeze is seller-agnostic: every uid gets the same refusal (no privilege escalation)", async () => {
    const { requestSettlementWithdrawal } = await import("../../settlement.server");
    for (const uid of [SELLER_A, SELLER_B, "admin_uid", ""]) {
      await expect(
        requestSettlementWithdrawal({
          uid,
          amount: 10,
          method: "bank",
          destination: "x",
        }),
      ).rejects.toThrow(/legacy-rail-frozen/);
    }
  });

  it("dead-code first-generation withdraw.server is frozen too (request + process)", async () => {
    const { requestWithdrawalServer, processWithdrawalServer } =
      await import("../../withdraw.server");
    await expect(
      requestWithdrawalServer({
        uid: SELLER_A,
        amount: 100,
        method: "bkash",
        destination: "01712345678",
      } as never),
    ).rejects.toThrow(/legacy-rail-frozen/);
    await expect(
      processWithdrawalServer({
        adminUid: "admin",
        sellerId: SELLER_A,
        withdrawalId: "w1",
        action: "approve",
      }),
    ).rejects.toThrow(/legacy-rail-frozen/);
  });
});

// ════════════════════════════════════════════════════════════════════
// B. IN-FLIGHT RESOLUTION — alive for legacy docs, closed to v2 docs
// ════════════════════════════════════════════════════════════════════

describe("B. In-flight legacy withdrawal resolution", () => {
  beforeEach(async () => {
    await seedDoc(`sellers/${SELLER_A}`, { uid: SELLER_A, shopName: "A", status: "approved" });
  });

  it("an in-flight legacy pending withdrawal CAN still be approved (money never stuck)", async () => {
    await seedLegacyPendingWithdrawal(SELLER_A, "w_inflight", 400);
    const { processSettlementWithdrawal } = await import("../../settlement.server");

    const result = await processSettlementWithdrawal({
      adminUid: "finance_admin_uid",
      sellerId: SELLER_A,
      withdrawalId: "w_inflight",
      action: "approve",
    });

    expect(result.status).toBe("completed");
    const wd = await getDoc(`sellers/${SELLER_A}/withdrawals/w_inflight`);
    expect(wd?.status).toBe("completed");
  });

  it("an in-flight legacy pending withdrawal CAN still be rejected (hold released)", async () => {
    await seedLegacyPendingWithdrawal(SELLER_A, "w_rej", 400);
    const { processSettlementWithdrawal } = await import("../../settlement.server");

    const result = await processSettlementWithdrawal({
      adminUid: "finance_admin_uid",
      sellerId: SELLER_A,
      withdrawalId: "w_rej",
      action: "reject",
      note: "test",
    });

    expect(result.status).toBe("rejected");
  });

  it("a v2-SHAPED withdrawal can NEVER be processed by the legacy writer (rail contamination blocked)", async () => {
    await seedDoc(`sellers/${SELLER_A}/withdrawals/w_v2`, {
      amountMinor: 50000,
      currency: "BDT",
      status: "REQUESTED",
      method: "bkash",
      requestedAt: Date.now(),
    });
    const { processSettlementWithdrawal } = await import("../../settlement.server");

    await expect(
      processSettlementWithdrawal({
        adminUid: "finance_admin_uid",
        sellerId: SELLER_A,
        withdrawalId: "w_v2",
        action: "approve",
      }),
    ).rejects.toThrow(/v2-withdrawal-use-v2-console/);

    const wd = await getDoc(`sellers/${SELLER_A}/withdrawals/w_v2`);
    expect(wd?.status).toBe("REQUESTED"); // untouched
  });

  it("resolution is idempotent: an already-completed legacy withdrawal refuses reprocessing", async () => {
    await seedDoc(`sellers/${SELLER_A}/withdrawals/w_done`, {
      amount: 300,
      method: "bank",
      status: "completed",
    });
    const { processSettlementWithdrawal } = await import("../../settlement.server");

    await expect(
      processSettlementWithdrawal({
        adminUid: "finance_admin_uid",
        sellerId: SELLER_A,
        withdrawalId: "w_done",
        action: "approve",
      }),
    ).rejects.toThrow(/already completed/);
  });
});

// ════════════════════════════════════════════════════════════════════
// C. v2-COVERED ORDERS — never credited on the legacy rail
// ════════════════════════════════════════════════════════════════════

describe("C. Single-rail credit guarantee (v2 coverage guard)", () => {
  beforeEach(async () => {
    await seedDoc(`sellers/${SELLER_A}`, { uid: SELLER_A, shopName: "A", status: "approved" });
    await seedSellerOrder(SELLER_A, ORDER_L, "hold", 800);
    await seedSellerOrder(SELLER_A, ORDER_V2, "hold", 900);
    await seedV2Settlement(SELLER_A, ORDER_V2, 90000);
  });

  it("releaseSettlementIfEligible SKIPS a v2-covered order (no legacy credit)", async () => {
    const { releaseSettlementIfEligible } = await import("../../settlement.server");
    const result = await releaseSettlementIfEligible({ sellerId: SELLER_A, orderId: ORDER_V2 });
    expect(result.released).toBe(false);

    const txs = await listDocs(`sellers/${SELLER_A}/walletTx`);
    expect(txs.length).toBe(0); // nothing credited
    const order = await getDoc(`sellers/${SELLER_A}/orders/${ORDER_V2}`);
    expect((order?.settlement as Record<string, unknown>)?.settlementStatus).toBe("hold");
  });

  it("releaseSettlementIfEligible STILL releases a legacy-only order (pre-v2 money is not stranded)", async () => {
    const { releaseSettlementIfEligible } = await import("../../settlement.server");
    const result = await releaseSettlementIfEligible({ sellerId: SELLER_A, orderId: ORDER_L });
    expect(result.released).toBe(true);
    expect(result.amount).toBe(800);

    const txs = await listDocs(`sellers/${SELLER_A}/walletTx`);
    expect(txs.length).toBe(1);
    expect(txs[0].data.type).toBe("earning");
    expect(txs[0].data.amount).toBe(800);
  });

  it("batchReleaseSettlements releases legacy-only orders and reports skippedV2Covered", async () => {
    const { batchReleaseSettlements } = await import("../../settlement.server");
    const result = await batchReleaseSettlements(SELLER_A);
    expect(result.releasedCount).toBe(1);
    expect(result.totalReleased).toBe(800);
    expect(result.skippedV2Covered).toBe(1);

    // Exactly ONE credit: the v2-covered order got nothing.
    const txs = await listDocs(`sellers/${SELLER_A}/walletTx`);
    expect(txs.length).toBe(1);
    const order = await getDoc(`sellers/${SELLER_A}/orders/${ORDER_V2}`);
    expect((order?.settlement as Record<string, unknown>)?.settlementStatus).toBe("hold");
  });

  it("refund reversal of a v2-covered UNRELEASED order touches the mirror but NEVER debits the legacy wallet", async () => {
    const { reverseSellerSettlement } = await import("../../settlement.server");
    const result = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_V2,
      reason: "refund",
      adminUid: "admin_uid",
    });
    expect(result.reversed).toBe(true);
    expect(result.walletImpact).toBe(0);

    const txs = await listDocs(`sellers/${SELLER_A}/walletTx`);
    expect(txs.every((t) => Number(t.data.amount) >= 0)).toBe(true);
  });

  it("refund reversal of a legacy-RELEASED v2-covered order debits the legacy credit exactly once (undo legacy side; v2 engine handles its own)", async () => {
    // Historic double-credit condition: legacy released BEFORE the guard.
    await seedSellerOrder(SELLER_A, ORDER_DC, "available", 750);
    await seedV2Settlement(SELLER_A, ORDER_DC, 75000);
    await seedDoc(`sellers/${SELLER_A}/walletTx/e_dc`, {
      type: "earning",
      amount: 750,
      status: "completed",
      orderId: ORDER_DC,
      createdAt: Date.now(),
    });

    const { reverseSellerSettlement } = await import("../../settlement.server");
    const result = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_DC,
      reason: "refund",
      adminUid: "admin_uid",
    });
    expect(result.reversed).toBe(true);
    expect(result.walletImpact).toBe(-750);

    // Idempotent: second reversal is a no-op.
    const again = await reverseSellerSettlement({
      sellerId: SELLER_A,
      orderId: ORDER_DC,
      reason: "refund",
      adminUid: "admin_uid",
    });
    expect(again.reversed).toBe(false);
    expect(again.walletImpact).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// D. CROSS-RAIL RECONCILIATION — double-credit detection, report-only
// ════════════════════════════════════════════════════════════════════

describe("D. Cross-rail reconciliation engine", () => {
  beforeEach(async () => {
    await seedDoc(`sellers/${SELLER_A}`, { uid: SELLER_A, shopName: "A", status: "approved" });
  });

  it("flags a double-credit conflict (legacy available + v2 settlement) as REQUIRES_MANUAL_REVIEW", async () => {
    await seedSellerOrder(SELLER_A, ORDER_DC, "available", 750);
    await seedV2Settlement(SELLER_A, ORDER_DC, 75000);

    const { runCrossRailReconciliation } = await import("../crossRail.server");
    const report = await runCrossRailReconciliation("test-project", SELLER_A);

    expect(report.status).toBe("REQUIRES_MANUAL_REVIEW");
    expect(report.doubleCreditOrders).toHaveLength(1);
    expect(report.doubleCreditOrders[0].orderId).toBe(ORDER_DC);
    expect(report.doubleCreditOrders[0].sellerEarnings).toBe(750);
    expect(report.doubleCreditOrders[0].v2NetMinor).toBe(75000);
  });

  it("a clean seller (legacy-only order, no v2 overlap) reports OK", async () => {
    await seedSellerOrder(SELLER_A, ORDER_L, "hold", 800);
    const { runCrossRailReconciliation } = await import("../crossRail.server");
    const report = await runCrossRailReconciliation("test-project", SELLER_A);

    expect(report.status).toBe("OK");
    expect(report.doubleCreditOrders).toHaveLength(0);
    expect(report.legacyMirror["hold"].amount).toBe(800);
  });

  it("reconciliation NEVER writes: mirror and walletTx docs are untouched after a report", async () => {
    await seedSellerOrder(SELLER_A, ORDER_DC, "available", 750);
    await seedV2Settlement(SELLER_A, ORDER_DC, 75000);
    const { runCrossRailReconciliation } = await import("../crossRail.server");
    await runCrossRailReconciliation("test-project", SELLER_A);

    const order = await getDoc(`sellers/${SELLER_A}/orders/${ORDER_DC}`);
    expect((order?.settlement as Record<string, unknown>)?.settlementStatus).toBe("available");
    expect(await listDocs(`sellers/${SELLER_A}/walletTx`)).toHaveLength(0);
  });

  it("runCrossRailReconciliationAll aggregates per-seller states and blocks on conflicts", async () => {
    await seedSellerOrder(SELLER_A, ORDER_DC, "available", 750);
    await seedV2Settlement(SELLER_A, ORDER_DC, 75000);
    await seedDoc(`sellers/${SELLER_B}`, { uid: SELLER_B, shopName: "B", status: "approved" });
    await seedSellerOrder(SELLER_B, ORDER_L, "hold", 300);

    const { runCrossRailReconciliationAll } = await import("../crossRail.server");
    const result = await runCrossRailReconciliationAll("test-project");

    expect(result.clean).toBe(false);
    expect(result.requiresReview).toContain(SELLER_A);
    expect(result.requiresReview).not.toContain(SELLER_B);
  });
});

// ════════════════════════════════════════════════════════════════════
// E. WITHDRAWAL STATE MIGRATION REPORT (shared collection, both shapes)
// ════════════════════════════════════════════════════════════════════

describe("E. Withdrawal migration report", () => {
  beforeEach(async () => {
    await seedDoc(`sellers/${SELLER_A}`, { uid: SELLER_A, shopName: "A", status: "approved" });
    // Legacy shapes
    await seedDoc(`sellers/${SELLER_A}/withdrawals/wd_pending`, {
      amount: 500,
      method: "bkash",
      status: "pending",
    });
    await seedDoc(`sellers/${SELLER_A}/withdrawals/wd_completed`, {
      amount: 300,
      method: "bank",
      status: "completed",
    });
    await seedDoc(`sellers/${SELLER_A}/withdrawals/wd_rejected`, {
      amount: 200,
      method: "nagad",
      status: "rejected",
    });
    // v2 shape (must be classified, never remapped)
    await seedDoc(`sellers/${SELLER_A}/withdrawals/wd_v2`, {
      amountMinor: 45000,
      currency: "BDT",
      status: "REQUESTED",
      method: "bkash",
    });
  });

  it("maps legacy lifecycle states to the v2 lifecycle (pending→REQUESTED, completed→COMPLETED, rejected→REJECTED)", async () => {
    const { reportWithdrawalMigration } = await import("../crossRail.server");
    const report = await reportWithdrawalMigration("test-project", SELLER_A);

    expect(report.total).toBe(4);
    expect(report.legacyDocs).toBe(3);
    expect(report.v2Docs).toBe(1);

    const byId = new Map(report.entries.map((e) => [e.withdrawalId, e]));
    expect(byId.get("wd_pending")?.proposedV2Status).toBe("REQUESTED");
    expect(byId.get("wd_pending")?.flags.join(" ")).toMatch(/in-flight/);
    expect(byId.get("wd_completed")?.proposedV2Status).toBe("COMPLETED");
    expect(byId.get("wd_rejected")?.proposedV2Status).toBe("REJECTED");
    expect(byId.get("wd_v2")?.shape).toBe("v2");
    expect(byId.get("wd_v2")?.proposedV2Status).toBeNull();
  });

  it("converts legacy float-taka amounts to integer-minor and flags in-flight docs for manual review", async () => {
    const { reportWithdrawalMigration } = await import("../crossRail.server");
    const report = await reportWithdrawalMigration("test-project", SELLER_A);

    const pending = report.entries.find((e) => e.withdrawalId === "wd_pending")!;
    expect(pending.amountTaka).toBe(500);
    expect(pending.amountMinor).toBe(50000);
    expect(report.requiresManualReview).toBeGreaterThan(0);
  });

  it("flags unknown legacy statuses and invalid amounts as REQUIRES_MANUAL_REVIEW", async () => {
    await seedDoc(`sellers/${SELLER_A}/withdrawals/wd_weird`, {
      amount: 100,
      status: "half_done",
    });
    await seedDoc(`sellers/${SELLER_A}/withdrawals/wd_bad_amount`, {
      amount: -5,
      status: "pending",
    });

    const { reportWithdrawalMigration } = await import("../crossRail.server");
    const report = await reportWithdrawalMigration("test-project", SELLER_A);

    const weird = report.entries.find((e) => e.withdrawalId === "wd_weird")!;
    expect(weird.flags.join(" ")).toMatch(/unknown legacy status/);
    const bad = report.entries.find((e) => e.withdrawalId === "wd_bad_amount")!;
    expect(bad.flags.join(" ")).toMatch(/invalid amount/);
  });

  it("the report is READ-ONLY: no withdrawal doc is modified", async () => {
    const { reportWithdrawalMigration } = await import("../crossRail.server");
    await reportWithdrawalMigration("test-project", SELLER_A);

    const wd = await getDoc(`sellers/${SELLER_A}/withdrawals/wd_pending`);
    expect(wd?.status).toBe("pending");
    expect(wd?.amount).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════
// F. V2 RAIL STILL WORKS — the live withdrawal path is unaffected
// ════════════════════════════════════════════════════════════════════

describe("F. v2 wallet rail unaffected by the freeze", () => {
  it("requestWalletWithdrawal + processWalletWithdrawal still function for a v2 seller", async () => {
    const { appendLedgerEntry } = await import("../ledger.server");
    const { requestWalletWithdrawal, processWalletWithdrawal } = await import("../wallet.server");

    await seedDoc(`sellers/${SELLER_A}`, { uid: SELLER_A, shopName: "A", status: "approved" });
    await appendLedgerEntry("test-project", {
      sellerId: SELLER_A,
      type: "ORDER_CREDIT",
      amountMinor: 20000,
      currency: "BDT",
      orderId: "ord_v2_live",
      createdBy: "test",
      idempotencyKey: "credit_live_1",
    });
    // appendLedgerEntry updates the stored sellerFinance balances atomically

    const request = await requestWalletWithdrawal("test-project", SELLER_A, {
      amountTaka: 50, // → 5000 minor
      method: "bkash",
      destination: "01712345678",
    });
    expect(request.withdrawalId).toBeTruthy();

    // Finance admin resolves it on the v2 rail (permission-gated).
    await seedDoc("users/fin_admin_uid", {
      uid: "fin_admin_uid",
      email: "fa@test.local",
      role: "admin",
      adminRole: "finance_admin",
      blocked: false,
    });
    const processed = await processWalletWithdrawal(
      "test-project",
      { uid: "fin_admin_uid", email: "fa@test.local" },
      { sellerId: SELLER_A, withdrawalId: request.withdrawalId, action: "approve" },
    );
    expect(["COMPLETED", "PROCESSING"]).toContain(processed.status ?? processed);
  });
});
