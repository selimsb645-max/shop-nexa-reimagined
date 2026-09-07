/**
 * AVENTA SHOP — Cross-Rail Reconciliation Engine (Sep 7, 2026)
 *
 * Seller Finance v2 (`sellerLedger` + `sellerFinance` + `settlements`) is the
 * canonical rail; the legacy rail (settlement.server.ts → `sellers/{uid}/walletTx`
 * + mirror `settlement` fields on seller orders) is frozen and being retired.
 *
 * This engine is REPORT-ONLY. It never writes, never credits, never debits.
 * Any non-zero difference or double-credit conflict is surfaced as
 * REQUIRES_MANUAL_REVIEW — automatic destructive migration is forbidden
 * until a human has reconciled it.
 */

import {
  batchGetDocs,
  docPath,
  fromFsFields,
  getAccessToken,
  runFirestoreQuery,
  type FsValue,
} from "../firebase-admin.server";
import { getSellerBalances, verifyLedgerIntegrity } from "./ledger.server";
import { querySellerLedger } from "./reconcile.server";
import { SETTLEMENTS_COLLECTION, settlementDocId } from "./settlements.server";
import { isV2WithdrawalDoc } from "./rail-mode.server";

export const LEGACY_WALLET_TX = "walletTx"; // sellers/{uid}/walletTx

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface LegacyWalletTotals {
  /** Sum of completed walletTx entries (credits + debits), taka. */
  completedTotal: number;
  /** Sum of pending withdrawal debits (money held for in-flight legacy withdrawals). */
  pendingWithdrawalHolds: number;
  earningCredits: number;
  withdrawalDebits: number;
  refundDebits: number;
}

export interface RailComparison {
  sellerId: string;
  legacy: LegacyWalletTotals;
  /** v2 sellerFinance balances (integer minor). */
  v2AvailableMinor: number;
  v2HeldMinor: number;
  v2PaidMinor: number;
  v2EarnedMinor: number;
  v2LedgerChainOk: boolean;
  /** Orders credited on BOTH rails — the double-credit conflict. */
  doubleCreditOrders: Array<{
    orderId: string;
    legacyStatus: string;
    sellerEarnings: number;
    v2NetMinor: number;
  }>;
  /** Legacy mirror orders still awaiting money movement (never credited anywhere yet — normal). */
  legacyUnreleasedOrders: number;
  /** Settlement breakdown of the legacy mirror by status. */
  legacyMirror: Record<string, { count: number; amount: number }>;
  status: "OK" | "REQUIRES_MANUAL_REVIEW";
  issues: string[];
}

export interface WithdrawalMigrationEntry {
  withdrawalId: string;
  shape: "legacy" | "v2";
  legacyStatus: string | null;
  amountTaka: number | null;
  amountMinor: number | null;
  proposedV2Status: "REQUESTED" | "COMPLETED" | "REJECTED" | null;
  flags: string[];
}

export interface WithdrawalMigrationReport {
  sellerId: string;
  total: number;
  legacyDocs: number;
  v2Docs: number;
  requiresManualReview: number;
  entries: WithdrawalMigrationEntry[];
}

// ────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────

interface QueryRow {
  document?: { name?: string; fields?: Record<string, FsValue> };
}

async function querySubcollection(
  projectId: string,
  segments: string[],
  collectionId: string,
  limit = 1000,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  // Subcollection queries need the parent-scoped runQuery endpoint
  // (documents/{parent}/{collectionId}:runQuery) — the generic
  // documents:runQuery only reaches top-level collections.
  const token = await getAccessToken();
  const hostOverride = Deno.env.get("FIRESTORE_EMULATOR_HOST");
  const root = hostOverride
    ? `http://${hostOverride}/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const res = await fetch(`${root}/${[...segments, collectionId].join("/")}:runQuery`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId }], limit },
    }),
  });
  if (!res.ok) throw new Error(`crossRail subcollection query failed (${res.status})`);
  const rows = (await res.json()) as QueryRow[];
  const out: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const row of rows) {
    if (!row.document?.name) continue;
    out.push({
      id: row.document.name.split("/").pop()!,
      data: fromFsFields(row.document.fields ?? {}),
    });
  }
  return out;
}

/** Sum legacy walletTx for one seller. */
async function readLegacyWalletTotals(
  projectId: string,
  sellerId: string,
): Promise<LegacyWalletTotals> {
  const txs = await querySubcollection(projectId, ["sellers", sellerId], LEGACY_WALLET_TX);
  const totals: LegacyWalletTotals = {
    completedTotal: 0,
    pendingWithdrawalHolds: 0,
    earningCredits: 0,
    withdrawalDebits: 0,
    refundDebits: 0,
  };
  for (const tx of txs) {
    const amount = Number(tx.data.amount ?? 0);
    const status = String(tx.data.status ?? "completed");
    const type = String(tx.data.type ?? "");
    if (status === "completed") {
      totals.completedTotal += amount;
      if (type === "earning" && amount > 0) totals.earningCredits += amount;
      if (type === "withdrawal" && amount < 0) totals.withdrawalDebits += amount;
      if ((type === "refund" || type === "reversal") && amount < 0) totals.refundDebits += amount;
    } else if (status === "pending" && amount < 0) {
      totals.pendingWithdrawalHolds += amount;
    }
  }
  return totals;
}

/** Read the legacy mirror settlement status of every seller order. */
async function readLegacyMirror(
  projectId: string,
  sellerId: string,
): Promise<Array<{ orderId: string; settlement: Record<string, unknown> }>> {
  const orders = await querySubcollection(projectId, ["sellers", sellerId], "orders");
  return orders
    .map((o) => ({
      orderId: o.id,
      settlement: (o.data.settlement ?? {}) as Record<string, unknown>,
    }))
    .filter((o) => Object.keys(o.settlement).length > 0);
}

/**
 * CROSS-RAIL RECONCILIATION (report-only). For one seller:
 * legacy rail vs v2 rail vs the union of both.
 */
export async function runCrossRailReconciliation(
  projectId: string,
  sellerId: string,
): Promise<RailComparison> {
  const [legacy, mirror] = await Promise.all([
    readLegacyWalletTotals(projectId, sellerId),
    readLegacyMirror(projectId, sellerId),
  ]);

  const issues: string[] = [];
  const doubleCreditOrders: RailComparison["doubleCreditOrders"] = [];
  const legacyMirror: Record<string, { count: number; amount: number }> = {};
  let legacyUnreleasedOrders = 0;

  // v2 coverage: one batched read of all v2 settlements for this seller's orders
  const names = mirror.map((m) =>
    docPath(projectId, [SETTLEMENTS_COLLECTION, settlementDocId(m.orderId, sellerId)]),
  );
  const coverage = new Map<string, Record<string, unknown>>();
  if (names.length > 0) {
    const docs = await batchGetDocs(projectId, names);
    for (const m of mirror) {
      const name = docPath(projectId, [
        SETTLEMENTS_COLLECTION,
        settlementDocId(m.orderId, sellerId),
      ]);
      const doc = docs.get(name);
      if (doc?.exists) coverage.set(m.orderId, doc.data as Record<string, unknown>);
    }
  }

  for (const m of mirror) {
    const status = String(m.settlement.settlementStatus ?? "pending");
    const earnings = Number(m.settlement.sellerNetEarnings ?? 0);
    const bucket = (legacyMirror[status] ??= { count: 0, amount: 0 });
    bucket.count += 1;
    bucket.amount += earnings;
    if (status === "pending" || status === "hold") legacyUnreleasedOrders += 1;

    // DOUBLE-CREDIT: legacy already credited (available/paid) AND v2 settled the same order.
    if ((status === "available" || status === "paid") && coverage.has(m.orderId)) {
      doubleCreditOrders.push({
        orderId: m.orderId,
        legacyStatus: status,
        sellerEarnings: earnings,
        v2NetMinor: Number((coverage.get(m.orderId) as Record<string, unknown>)?.netMinor ?? 0),
      });
    }
  }

  // v2 rail: ledger chain + stored balances
  const entries = await querySellerLedger(projectId, sellerId);
  const integrity = await verifyLedgerIntegrity(projectId, sellerId, entries);
  if (!integrity.ok) {
    issues.push(`v2 ledger chain mismatch: ${integrity.mismatches.join("; ")}`);
  }
  const stored = await getSellerBalances(projectId, sellerId);

  if (doubleCreditOrders.length > 0) {
    issues.push(
      `${doubleCreditOrders.length} order(s) credited on BOTH rails (double-credit) — these were legacy-released before the v2-coverage guard existed. Manual review required.`,
    );
  }

  return {
    sellerId,
    legacy,
    v2AvailableMinor: stored.availableMinor,
    v2HeldMinor: stored.heldMinor,
    v2PaidMinor: stored.paidOutMinor,
    v2EarnedMinor: stored.totalEarnedMinor,
    v2LedgerChainOk: integrity.ok,
    doubleCreditOrders,
    legacyUnreleasedOrders,
    legacyMirror,
    status: issues.length > 0 ? "REQUIRES_MANUAL_REVIEW" : "OK",
    issues,
  };
}

/**
 * Sweep all sellers with any v2 wallet doc OR legacy mirror money and
 * reconcile each. Returns per-seller reports; any REQUIRES_MANUAL_REVIEW
 * blocks destructive migration steps (release sweep, history import).
 */
export async function runCrossRailReconciliationAll(
  projectId: string,
): Promise<{ sellers: RailComparison[]; clean: boolean; requiresReview: string[] }> {
  const financeRows = (await runFirestoreQuery(projectId, {
    from: [{ collectionId: "sellerFinance" }],
    limit: 500,
  })) as QueryRow[];
  const sellerIds = new Set<string>(
    financeRows.filter((r) => r.document?.name).map((r) => r.document!.name!.split("/").pop()!),
  );
  // Include sellers that only have legacy money (pre-v2) via their mirror docs.
  const sellerRows = (await runFirestoreQuery(projectId, {
    from: [{ collectionId: "sellers" }],
    limit: 500,
  })) as QueryRow[];
  for (const r of sellerRows) {
    if (r.document?.name) sellerIds.add(r.document!.name!.split("/").pop()!);
  }

  const sellers: RailComparison[] = [];
  for (const sellerId of sellerIds) {
    sellers.push(await runCrossRailReconciliation(projectId, sellerId));
  }
  const requiresReview = sellers.filter((s) => s.status !== "OK").map((s) => s.sellerId);
  return { sellers, clean: requiresReview.length === 0, requiresReview };
}

/**
 * WITHDRAWAL STATE MIGRATION REPORT (report-only). Legacy and v2
 * withdrawals share sellers/{uid}/withdrawals; classify every doc and
 * propose the v2 lifecycle state WITHOUT writing anything.
 *
 * Mapping (from the actual schemas — settlement.server.ts writes
 * "pending"/"completed"/"rejected"; v2 WithdrawalStatus is
 * REQUESTED/PROCESSING/COMPLETED/REJECTED/FAILED):
 *   pending   → REQUESTED   (in-flight: must be resolved by a finance
 *                            admin on the legacy rail before stage 2)
 *   completed → COMPLETED
 *   rejected  → REJECTED
 */
export async function reportWithdrawalMigration(
  projectId: string,
  sellerId: string,
): Promise<WithdrawalMigrationReport> {
  const withdrawals = await querySubcollection(projectId, ["sellers", sellerId], "withdrawals");

  const entries: WithdrawalMigrationEntry[] = [];
  let v2Docs = 0;
  let requiresManualReview = 0;

  for (const w of withdrawals) {
    const flags: string[] = [];
    if (isV2WithdrawalDoc(w.data)) {
      v2Docs += 1;
      entries.push({
        withdrawalId: w.id,
        shape: "v2",
        legacyStatus: null,
        amountTaka: null,
        amountMinor: Number(w.data.amountMinor ?? 0),
        proposedV2Status: null,
        flags: ["already-v2"],
      });
      continue;
    }

    const status = String(w.data.status ?? "pending");
    const amount = Number(w.data.amount ?? 0);
    let proposed: WithdrawalMigrationEntry["proposedV2Status"] = null;
    if (status === "pending") {
      proposed = "REQUESTED";
      flags.push("in-flight: resolve on legacy rail (admin approve/reject) before stage 2 freeze");
    } else if (status === "completed") {
      proposed = "COMPLETED";
    } else if (status === "rejected") {
      proposed = "REJECTED";
    } else {
      flags.push(`unknown legacy status "${status}"`);
    }

    // Money-mismatch heuristics → REQUIRES_MANUAL_REVIEW
    if (!Number.isFinite(amount) || amount <= 0) {
      flags.push("invalid amount");
    }
    if (status === "pending") {
      requiresManualReview += 1;
    }
    if (flags.some((f) => f.startsWith("unknown") || f === "invalid amount")) {
      requiresManualReview += 1;
    }

    entries.push({
      withdrawalId: w.id,
      shape: "legacy",
      legacyStatus: status,
      amountTaka: amount,
      amountMinor: Math.round(amount * 100),
      proposedV2Status: proposed,
      flags,
    });
  }

  return {
    sellerId,
    total: withdrawals.length,
    legacyDocs: withdrawals.length - v2Docs,
    v2Docs,
    requiresManualReview,
    entries,
  };
}

/**
 * RELEASE SWEEP GATE: the v2 return-window release sweep may only run
 * when no order is credited on both rails. Returns the conflict list;
 * empty means the sweep may proceed.
 */
export async function findDoubleCreditConflicts(
  projectId: string,
  sellerIds: string[],
): Promise<RailComparison["doubleCreditOrders"]> {
  const conflicts: RailComparison["doubleCreditOrders"] = [];
  for (const sellerId of sellerIds) {
    const report = await runCrossRailReconciliation(projectId, sellerId);
    conflicts.push(...report.doubleCreditOrders);
  }
  return conflicts;
}

// Re-export for callers that build raw docs in tests
// toFsFields re-export intentionally omitted
