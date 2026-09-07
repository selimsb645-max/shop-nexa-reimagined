/**
 * AVENTA SHOP — Finance Reconciliation & Dashboard (Prompt 04 §9)
 *
 * Detects mismatches between:
 *   - Ledger replay  ↔  stored seller balances   (chain integrity)
 *   - Payout docs    ↔  ledger PAYOUT entries    (transfer integrity)
 *   - Settlement states ↔ batch/payout states    (lifecycle integrity)
 *
 * All integer paisa. Server-only (service account).
 */

import { docPath, batchGetDocs, runFirestoreQuery, fromFsFields } from "../firebase-admin.server";
import {
  verifyLedgerIntegrity,
  SELLER_LEDGER_COLLECTION,
  SELLER_FINANCE_COLLECTION,
  type LedgerEntry,
  type LedgerEntryType,
} from "./ledger.server";
import { querySettlements, SETTLEMENTS_COLLECTION } from "./settlements.server";
import {
  queryBatches,
  queryPayouts,
  SETTLEMENT_BATCHES_COLLECTION,
  PAYOUTS_COLLECTION,
  type PayoutDoc,
  type BatchState,
} from "./settlementBatch.server";

/** Query all ledger entries for a seller (chronological). */
export async function querySellerLedger(
  projectId: string,
  sellerId: string,
  limit = 1000,
): Promise<LedgerEntry[]> {
  const json = (await runFirestoreQuery(projectId, {
    from: [{ collectionId: SELLER_LEDGER_COLLECTION }],
    where: {
      fieldFilter: {
        field: { fieldPath: "sellerId" },
        op: "EQUAL",
        value: { stringValue: sellerId },
      },
    },
    limit,
  })) as Array<{ document?: { fields: Record<string, unknown> } }>;
  return json
    .filter((r) => r.document)
    .map((r) => fromFsFields(r.document!.fields as never) as unknown as LedgerEntry)
    .sort((a, b) => a.createdAt - b.createdAt || a.transactionId.localeCompare(b.transactionId));
}

export interface FinanceDashboard {
  currency: "BDT";
  settlementTotals: Record<string, { count: number; netMinor: number }>;
  payoutTotals: Record<string, { count: number; amountMinor: number }>;
  batchTotals: Record<string, { count: number; netMinor: number }>;
  failedPayouts: PayoutDoc[];
  refundTotalMinor: number; // sum of REFUND_DEBIT ledger entries
  adjustmentTotalMinor: number; // sum of signed ADJUSTMENT ledger entries
  heldTotalMinor: number; // sum of settlement nets still in held states
  mismatches: string[];
  sellersChecked: number;
}

const HELD_SETTLEMENT_STATES = [
  "PENDING",
  "DELIVERED",
  "RETURN_WINDOW",
  "SETTLEMENT_BATCH",
  "PROCESSING",
];

/**
 * Build the finance dashboard + mismatch report (§9). Callers pass the
 * list of sellers to check (from a settlement/payout query upstream or
 * a seller directory); all integer arithmetic.
 */
export async function computeFinanceDashboard(
  projectId: string,
  sellerIds: string[],
): Promise<FinanceDashboard> {
  const [settlements, payouts, batches] = await Promise.all([
    querySettlements(projectId, { limit: 500 }),
    queryPayouts(projectId, { limit: 500 }),
    queryBatches(projectId, { limit: 100 }),
  ]);

  const settlementTotals: FinanceDashboard["settlementTotals"] = {};
  for (const s of settlements) {
    const bucket = (settlementTotals[s.state] ??= { count: 0, netMinor: 0 });
    bucket.count++;
    bucket.netMinor += Number(s.netMinor ?? 0);
  }

  const payoutTotals: FinanceDashboard["payoutTotals"] = {};
  for (const p of payouts) {
    const bucket = (payoutTotals[p.status] ??= { count: 0, amountMinor: 0 });
    bucket.count++;
    bucket.amountMinor += p.amountMinor;
  }

  const batchTotals: FinanceDashboard["batchTotals"] = {};
  for (const b of batches) {
    const bucket = (batchTotals[b.state as BatchState] ??= { count: 0, netMinor: 0 });
    bucket.count++;
    bucket.netMinor += Number(b.totalNetMinor ?? 0);
  }

  const failedPayouts = payouts.filter((p) => p.status === "FAILED");
  const heldTotalMinor = HELD_SETTLEMENT_STATES.reduce(
    (sum, st) => sum + (settlementTotals[st]?.netMinor ?? 0),
    0,
  );

  // ── LEDGER INTEGRITY per seller + refund/adjustment totals ──────
  const mismatches: string[] = [];
  let refundTotalMinor = 0;
  let adjustmentTotalMinor = 0;
  let sellersChecked = 0;
  const sellers = [...new Set(sellerIds)];
  for (const sellerId of sellers) {
    const entries = await querySellerLedger(projectId, sellerId);
    if (entries.length === 0) continue;
    sellersChecked++;
    for (const e of entries) {
      if (e.type === "REFUND_DEBIT") refundTotalMinor += e.amountMinor;
      if (e.type === "ADJUSTMENT") adjustmentTotalMinor += e.amountMinor;
    }
    const integrity = await verifyLedgerIntegrity(projectId, sellerId, entries);
    if (!integrity.ok) mismatches.push(`seller ${sellerId}: ${integrity.mismatches.join("; ")}`);
  }

  // ── GLOBAL PAYOUT CROSS-CHECK: payout docs vs ledger PAYOUT entries.
  // Every payout doc must have exactly one matching ledger entry
  // (deterministic id) with the same amount — duplicates are impossible
  // by construction, missing/divergent entries are reported here.
  if (payouts.length > 0) {
    const payoutLedgerNames = payouts.map((p) =>
      docPath(projectId, [SELLER_LEDGER_COLLECTION, `led_${p.sellerId}_pay_${p.payoutReference}`]),
    );
    const docs = await batchGetDocs(projectId, payoutLedgerNames);
    payouts.forEach((p, i) => {
      const entry = docs.get(payoutLedgerNames[i]);
      if (!entry?.exists) {
        mismatches.push(`payout ${p.payoutId}: missing ledger PAYOUT entry`);
        return;
      }
      const amount = Number((entry.data as Record<string, unknown>)["amountMinor"] ?? 0);
      if (amount !== p.amountMinor) {
        mismatches.push(`payout ${p.payoutId}: doc ${p.amountMinor} != ledger ${amount}`);
      }
    });
  }

  // ── SETTLEMENT LIFECYCLE CROSS-CHECK: no PAID settlement without a
  // payout reference (a settlement can never silently become PAID).
  const paidWithoutPayout = settlements.filter((s) => s.state === "PAID" && !s.payoutId);
  if (paidWithoutPayout.length > 0) {
    mismatches.push(`${paidWithoutPayout.length} PAID settlements missing payoutId`);
  }

  return {
    currency: "BDT",
    settlementTotals,
    payoutTotals,
    batchTotals,
    failedPayouts,
    refundTotalMinor,
    adjustmentTotalMinor,
    heldTotalMinor,
    mismatches,
    sellersChecked,
  };
}

/** Collection names exported for Firestore rules + tests. */
export const FINANCE_COLLECTIONS = {
  sellerLedger: SELLER_LEDGER_COLLECTION,
  sellerFinance: SELLER_FINANCE_COLLECTION,
  settlements: SETTLEMENTS_COLLECTION,
  settlementBatches: SETTLEMENT_BATCHES_COLLECTION,
  payouts: PAYOUTS_COLLECTION,
} as const;

export type { LedgerEntryType };
