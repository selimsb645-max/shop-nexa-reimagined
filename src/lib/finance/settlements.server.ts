/**
 * AVENTA SHOP — Seller Settlements v2 (Prompt 04 §2, §4, §5)
 *
 * One settlement record per (order, seller): `settlements/{st_orderId_sellerId}`.
 * Lifecycle is driven by the order workflow events (Prompt 03 engine):
 *
 *   ORDER_CREATED → createSettlementsForOrder (PENDING + ledger entries:
 *                   ORDER_CREDIT, COMMISSION_DEBIT, SHIPPING_DEBIT,
 *                   SETTLEMENT_HOLD — all paisa, all idempotent)
 *   DELIVERED     → settlement PENDING→DELIVERED (deliveredAt recorded)
 *   cron/admin    → DELIVERED→RETURN_WINDOW→ELIGIBLE when the CONFIGURED
 *                   return window elapses (SETTLEMENT_RELEASE ledger entry)
 *   REFUNDED/
 *   RETURNED/
 *   CANCELLED    → refund/reversal path (REFUND_DEBIT / REVERSED state)
 *
 * RETURN WINDOW (§5): resolved per settlement at creation:
 *   financeConfig.categoryReturnWindowOverrides[categoryId]
 *   → financeConfig.defaultReturnWindowDays
 *   → legacy SETTLEMENT_HOLD_DAYS (types/settlement.ts) — the ONLY
 *   fallback; nothing is hard-coded here. Category/policy overrides are
 *   data, so future policies need zero code changes.
 */

import {
  docPath,
  batchGetDocs,
  commitWrites,
  runFirestoreQuery,
  toFsFields,
  fromFsFields,
  type FsWrite,
} from "../firebase-admin.server";
// (getAccessToken intentionally NOT imported — queries go through the
// emulator-aware runFirestoreQuery helper.)
import { SETTLEMENT_HOLD_DAYS } from "../../types/settlement";
import { appendLedgerEntry } from "./ledger.server";
import { isValidSettlementTransition, type SettlementState } from "./settlementStateMachine";
import type { OrderLineFinancial } from "./fees.server";

export const SETTLEMENTS_COLLECTION = "settlements";
export const FINANCE_CONFIG_COLLECTION = "financeConfig";
export const FINANCE_CONFIG_DOC = "settings";

export interface FinanceConfig {
  currency: "BDT";
  /** Default return window (days) — configurable, never hard-coded. */
  defaultReturnWindowDays: number;
  /** category id → days override (future policy customization). */
  categoryReturnWindowOverrides: Record<string, number>;
  /** Active payout provider id (Prompt 04 §7). */
  payoutProvider: string;
  /** Explicit opt-in required for MOCK payouts even in production. */
  mockPayoutEnabled: boolean;
}

const DEFAULT_CONFIG: FinanceConfig = {
  currency: "BDT",
  defaultReturnWindowDays: SETTLEMENT_HOLD_DAYS, // legacy default, still configurable
  categoryReturnWindowOverrides: {},
  payoutProvider: "MOCK",
  mockPayoutEnabled: false,
};

export async function readFinanceConfig(projectId: string): Promise<FinanceConfig> {
  const docs = await batchGetDocs(projectId, [
    docPath(projectId, [FINANCE_CONFIG_COLLECTION, FINANCE_CONFIG_DOC]),
  ]);
  const doc = docs.get(docPath(projectId, [FINANCE_CONFIG_COLLECTION, FINANCE_CONFIG_DOC]));
  if (!doc?.exists) return { ...DEFAULT_CONFIG };
  // NOTE: FetchedDoc.data is ALREADY decoded by batchGetDocs — never
  // run fromFsFields over it (double-decode corrupts values).
  const raw = doc.data as Partial<FinanceConfig>;
  return {
    currency: "BDT",
    defaultReturnWindowDays: Number(
      raw.defaultReturnWindowDays ?? DEFAULT_CONFIG.defaultReturnWindowDays,
    ),
    categoryReturnWindowOverrides:
      (raw.categoryReturnWindowOverrides as FinanceConfig["categoryReturnWindowOverrides"]) ?? {},
    payoutProvider: String(raw.payoutProvider ?? DEFAULT_CONFIG.payoutProvider),
    mockPayoutEnabled: Boolean(raw.mockPayoutEnabled),
  };
}

export function settlementDocId(orderId: string, sellerId: string): string {
  return `st_${orderId}_${sellerId}`;
}

interface SettlementDoc {
  settlementId: string;
  orderId: string;
  sellerId: string;
  categoryId: string | null;
  state: SettlementState;
  currency: "BDT";
  grossMinor: number;
  commissionMinor: number;
  shippingFeeMinor: number;
  netMinor: number;
  commissionBps: number;
  returnWindowDays: number;
  returnWindowEndsAt: number | null;
  deliveredAt: number | null;
  batchId: string | null;
  payoutId: string | null;
  holdReason: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Create per-seller settlements for a placed order. Idempotent: if the
 * settlement doc already exists (duplicate ORDER_CREATED replay), it is
 * returned untouched and NO ledger entries are re-posted.
 */
export async function createSettlementsForOrder(
  projectId: string,
  orderId: string,
  lines: OrderLineFinancial[],
  config: FinanceConfig,
  createdAt = Date.now(),
): Promise<{ created: number; skipped: number }> {
  if (lines.length === 0) return { created: 0, skipped: 0 };
  const names = lines.map((l) =>
    docPath(projectId, [SETTLEMENTS_COLLECTION, settlementDocId(orderId, l.sellerId)]),
  );
  const existing = await batchGetDocs(projectId, names);

  let created = 0,
    skipped = 0;
  const writes: FsWrite[] = [];
  for (const l of lines) {
    const name = docPath(projectId, [SETTLEMENTS_COLLECTION, settlementDocId(orderId, l.sellerId)]);
    if (existing.get(name)?.exists) {
      skipped++;
      continue;
    }

    writes.push({
      update: {
        name,
        fields: toFsFields({
          settlementId: settlementDocId(orderId, l.sellerId),
          orderId,
          sellerId: l.sellerId,
          state: "PENDING",
          currency: "BDT",
          categoryId: l.categoryId ?? null,
          grossMinor: l.gross.amountMinor,
          commissionMinor: l.commission.amountMinor,
          shippingFeeMinor: l.shippingFee.amountMinor,
          netMinor: l.sellerNet.amountMinor,
          commissionBps: l.commissionBps,
          createdAt,
          updatedAt: createdAt,
          returnWindowDays: null, // resolved on delivery
          returnWindowEndsAt: null,
          deliveredAt: null,
          batchId: null,
          payoutId: null,
          holdReason: null,
        }),
      },
    });
  }
  if (writes.length > 0) await commitWrites(projectId, writes);

  // ── LEDGER-FIRST (§1): post the movement entries — deterministic
  // idempotency keys mean a replay can never double-post.
  for (const l of lines) {
    const name = docPath(projectId, [SETTLEMENTS_COLLECTION, settlementDocId(orderId, l.sellerId)]);
    if (existing.get(name)?.exists) continue;
    await appendLedgerEntry(projectId, {
      sellerId: l.sellerId,
      type: "ORDER_CREDIT",
      amountMinor: l.gross.amountMinor,
      currency: "BDT",
      orderId,
      reference: null,
      createdBy: "system",
      idempotencyKey: `oc_${orderId}`,
    });
    await appendLedgerEntry(projectId, {
      sellerId: l.sellerId,
      type: "COMMISSION_DEBIT",
      amountMinor: l.commission.amountMinor,
      currency: "BDT",
      orderId,
      reference: null,
      createdBy: "system",
      idempotencyKey: `cd_${orderId}`,
    });
    if (l.shippingFee.amountMinor > 0) {
      await appendLedgerEntry(projectId, {
        sellerId: l.sellerId,
        type: "SHIPPING_DEBIT",
        amountMinor: l.shippingFee.amountMinor,
        currency: "BDT",
        orderId,
        reference: null,
        createdBy: "system",
        idempotencyKey: `sd_${orderId}`,
      });
    }
    // Net earnings held until the return window clears.
    await appendLedgerEntry(projectId, {
      sellerId: l.sellerId,
      type: "SETTLEMENT_HOLD",
      amountMinor: l.sellerNet.amountMinor,
      currency: "BDT",
      orderId,
      reference: settlementDocId(orderId, l.sellerId),
      createdBy: "system",
      idempotencyKey: `sh_${orderId}`,
    });
    created++;
  }
  return { created, skipped };
}

async function readSettlement(
  projectId: string,
  settlementId: string,
): Promise<SettlementDoc | null> {
  const name = docPath(projectId, [SETTLEMENTS_COLLECTION, settlementId]);
  const docs = await batchGetDocs(projectId, [name]);
  const doc = docs.get(name);
  if (!doc?.exists) return null;
  return doc.data as unknown as SettlementDoc;
}

/**
 * Event hook: advance all settlements of an order on lifecycle events.
 * Called by the order workflow finance handler (DELIVERED / RETURNED /
 * REFUNDED / CANCELLED). Idempotent + transition-validated.
 */
export async function advanceSettlementsForOrderEvent(
  projectId: string,
  orderId: string,
  eventType: "DELIVERED" | "RETURNED" | "REFUNDED" | "REFUND_PENDING" | "CANCELLED",
  config: FinanceConfig,
  now = Date.now(),
): Promise<{ updated: number; held: number }> {
  // Find this order's settlements by deterministic ids is not possible
  // without the seller list — query by orderId instead.
  const rows = await querySettlements(projectId, { orderId, limit: 50 });
  let updated = 0,
    held = 0;
  for (const s of rows) {
    // `now` is injectable for deterministic tests (default: wall clock).
    if (eventType === "DELIVERED") {
      if (s.state !== "PENDING") continue; // idempotent replay / no-op
      const days = resolveReturnWindowDays(config, s.categoryId);
      const endsAt = now + days * 86_400_000;
      await transitionSettlement(projectId, s.settlementId, "DELIVERED", {
        deliveredAt: now,
        returnWindowDays: days,
        returnWindowEndsAt: endsAt,
        updatedAt: now,
      });
      updated++;
    } else if (eventType === "REFUND_PENDING") {
      // Refund REQUESTED but not completed: flag for finance, no debit.
      if (["PENDING", "DELIVERED", "RETURN_WINDOW", "ELIGIBLE"].includes(s.state)) {
        await transitionSettlement(projectId, s.settlementId, "REFUND_PENDING", {
          updatedAt: now,
          holdReason: "refund requested",
        });
        updated++;
      }
    } else if (eventType === "RETURNED" || eventType === "REFUNDED") {
      // Refund path: release the held net back, then debit it, and
      // mark REVERSED. Entries are new transactions (ledger is
      // append-only — corrections are never edits, §10).
      if (
        ["PENDING", "DELIVERED", "RETURN_WINDOW", "REFUND_PENDING", "ELIGIBLE"].includes(s.state)
      ) {
        // Release the held net FIRST if the hold still exists (it was
        // already released for ELIGIBLE settlements) — then debit the
        // refund so the net effect is exactly zero for the seller.
        const holdStillActive = [
          "PENDING",
          "DELIVERED",
          "RETURN_WINDOW",
          "REFUND_PENDING",
        ].includes(s.state);
        if (holdStillActive) {
          await appendLedgerEntry(projectId, {
            sellerId: s.sellerId,
            type: "SETTLEMENT_RELEASE",
            amountMinor: s.netMinor,
            currency: "BDT",
            orderId,
            reference: s.settlementId,
            createdBy: "system",
            idempotencyKey: `sr_refund_${orderId}`,
          });
        }
        await appendLedgerEntry(projectId, {
          sellerId: s.sellerId,
          type: "REFUND_DEBIT",
          amountMinor: s.netMinor,
          currency: "BDT",
          orderId,
          reference: s.settlementId,
          createdBy: "system",
          idempotencyKey: `rd_${orderId}`,
        });
        await transitionSettlement(projectId, s.settlementId, "REVERSED", {
          updatedAt: now,
          holdReason: `order ${eventType.toLowerCase()}`,
        });
        updated++;
      }
    } else if (eventType === "CANCELLED") {
      if (s.state === "REVERSED") {
        continue;
      }
      if (
        s.state === "PENDING" ||
        s.state === "DELIVERED" ||
        s.state === "RETURN_WINDOW" ||
        s.state === "ELIGIBLE"
      ) {
        // Order cancelled before payout: un-hold, then debit the net
        // (the sale never happened).
        await appendLedgerEntry(projectId, {
          sellerId: s.sellerId,
          type: "SETTLEMENT_RELEASE",
          amountMinor: s.netMinor,
          currency: "BDT",
          orderId,
          reference: s.settlementId,
          createdBy: "system",
          idempotencyKey: `sr_cancel_${orderId}`,
        });
        await appendLedgerEntry(projectId, {
          sellerId: s.sellerId,
          type: "REFUND_DEBIT",
          amountMinor: s.netMinor,
          currency: "BDT",
          orderId,
          reference: s.settlementId,
          createdBy: "system",
          idempotencyKey: `rd_cancel_${orderId}`,
        });
        await transitionSettlement(projectId, s.settlementId, "REVERSED", {
          updatedAt: now,
          holdReason: "order cancelled",
        });
        updated++;
      } else if (
        s.state === "SETTLEMENT_BATCH" ||
        s.state === "PROCESSING" ||
        s.state === "ON_HOLD" ||
        s.state === "DISPUTED" ||
        s.state === "REFUND_PENDING"
      ) {
        // In (or held out of) the batch pipeline — flag for finance review
        // instead of silently reversing mid-payout.
        await transitionSettlement(projectId, s.settlementId, "ON_HOLD", {
          updatedAt: now,
          holdReason: "order cancelled — finance review required",
        });
        held++;
      }
    }
  }
  return { updated, held };
}

function resolveReturnWindowDays(config: FinanceConfig, categoryId?: string | null): number {
  if (categoryId && config.categoryReturnWindowOverrides[categoryId] != null) {
    return Number(config.categoryReturnWindowOverrides[categoryId]);
  }
  return config.defaultReturnWindowDays;
}

/**
 * Cron/admin job: move DELIVERED settlements past their return window
 * through RETURN_WINDOW → ELIGIBLE and release the hold (ledger entry
 * SETTLEMENT_RELEASE — held → available). Idempotent.
 */
export async function advanceReturnWindowSettlements(
  projectId: string,
  config: FinanceConfig,
  now = Date.now(),
): Promise<{ eligible: number; released: number }> {
  const rows = await querySettlements(projectId, { state: "DELIVERED", limit: 500 });
  let eligible = 0,
    released = 0;
  for (const s of rows) {
    const endsAt = Number(s.returnWindowEndsAt ?? 0);
    if (endsAt > now) continue;
    if (!isValidSettlementTransition(s.state, "RETURN_WINDOW")) continue;
    await transitionSettlement(projectId, s.settlementId, "RETURN_WINDOW", { updatedAt: now });
    if (!isValidSettlementTransition("RETURN_WINDOW", "ELIGIBLE")) continue;
    await appendLedgerEntry(projectId, {
      sellerId: s.sellerId,
      type: "SETTLEMENT_RELEASE",
      amountMinor: s.netMinor,
      currency: "BDT",
      orderId: s.orderId,
      reference: s.settlementId,
      createdBy: "system",
      idempotencyKey: `sr_${s.orderId}`,
    });
    await transitionSettlement(projectId, s.settlementId, "ELIGIBLE", { updatedAt: now });
    eligible++;
    released++;
  }
  return { eligible, released };
}

/** Validated state transition write (mirror of the pure state machine). */
export async function transitionSettlement(
  projectId: string,
  settlementId: string,
  to: SettlementState,
  extra: Partial<SettlementDoc> = {},
): Promise<void> {
  const current = await readSettlement(projectId, settlementId);
  if (!current) throw new Error(`finance/settlement: ${settlementId} not found`);
  if (!isValidSettlementTransition(current.state, to)) {
    throw new Error(
      `finance/settlement: invalid transition ${current.state} → ${to} (${settlementId})`,
    );
  }
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [SETTLEMENTS_COLLECTION, settlementId]),
        fields: toFsFields({
          ...current,
          ...extra,
          state: to,
          updatedAt: extra.updatedAt ?? current.updatedAt,
        }),
      },
    },
  ]);
}

export type SettlementQuery = {
  state?: SettlementState;
  orderId?: string;
  sellerId?: string;
  batchId?: string;
  limit?: number;
};

/** Query settlements (top-level collection) via runQuery. */
export async function querySettlements(
  projectId: string,
  q: SettlementQuery,
): Promise<SettlementDoc[]> {
  const where: unknown[] = [];
  if (q.state)
    where.push({ field: { fieldPath: "state" }, op: "EQUAL", value: { stringValue: q.state } });
  if (q.orderId)
    where.push({ field: { fieldPath: "orderId" }, op: "EQUAL", value: { stringValue: q.orderId } });
  if (q.sellerId)
    where.push({
      field: { fieldPath: "sellerId" },
      op: "EQUAL",
      value: { stringValue: q.sellerId },
    });
  if (q.batchId)
    where.push({ field: { fieldPath: "batchId" }, op: "EQUAL", value: { stringValue: q.batchId } });
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: SETTLEMENTS_COLLECTION }],
    limit: q.limit ?? 100,
  };
  if (where.length > 0) {
    structuredQuery["where"] =
      where.length === 1
        ? { fieldFilter: where[0] }
        : { compositeFilter: { op: "AND", filters: where.map((f) => ({ fieldFilter: f })) } };
  }
  const body = { structuredQuery };
  const json = (await runFirestoreQuery(projectId, body.structuredQuery)) as Array<{
    document?: { name: string; fields: Record<string, unknown> };
  }>;
  return json
    .filter((row) => row.document)
    .map((row) => fromFsFields(row.document!.fields as never) as unknown as SettlementDoc);
}
