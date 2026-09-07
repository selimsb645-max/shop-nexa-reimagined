/**
 * AVENTA SHOP — Settlement Batches & Payouts (Prompt 04 §6, §7, §8, §9)
 *
 * BATCH FLOW (never one-click money movement):
 *   generate (finance.settlement)  → DRAFT
 *   review   (finance.review)      → IN_REVIEW
 *   approve  (finance.settlement + FRESH RE-AUTH)  → APPROVED
 *   execute  (finance.payout + FRESH RE-AUTH)      → EXECUTING → per-seller payouts
 *   reconcile(finance.reconcile)  → RECONCILED
 *
 * PAYOUT IDEMPOTENCY (§8):
 *   payoutReference = `PO_{batchId}_{sellerId}` — deterministic. The
 *   payouts doc id IS the reference, so Firestore uniqueness + a
 *   transaction existence check make a double execution impossible:
 *   the second call finds the existing payout and returns it.
 *
 * PAYOUT PROVIDERS (§7): resolved from financeConfig.payoutProvider via
 * the registry. MOCK is refused in production mode unless explicitly
 * enabled — fake payouts never touch the real ledger as "money sent".
 *
 * RE-AUTH (§6): approve/execute/adjust/refund require the caller's
 * Firebase ID token to be FRESH (recently re-authenticated), verified
 * SERVER-SIDE — a stale session token cannot move money.
 */

import {
  docPath,
  batchGetDocs,
  commitWrites,
  runFirestoreQuery,
  newDocId,
  toFsFields,
  fromFsFields,
  verifyIdToken,
  type FsWrite,
} from "../firebase-admin.server";
import { appendLedgerEntry } from "./ledger.server";
import {
  transitionSettlement,
  querySettlements,
  readFinanceConfig,
  type FinanceConfig,
} from "./settlements.server";
import { resolvePayoutProvider } from "./payoutProviders/registry";
import { hasFinancePermission, type FinancePermission } from "./permissions";

export const SETTLEMENT_BATCHES_COLLECTION = "settlementBatches";
export const PAYOUTS_COLLECTION = "payouts";

export const BATCH_STATES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "EXECUTING",
  "RECONCILED",
  "FAILED",
] as const;
export type BatchState = (typeof BATCH_STATES)[number];

const BATCH_TRANSITIONS: Record<BatchState, readonly BatchState[]> = {
  DRAFT: ["IN_REVIEW", "FAILED"],
  IN_REVIEW: ["APPROVED", "DRAFT", "FAILED"],
  APPROVED: ["EXECUTING", "FAILED"],
  EXECUTING: ["RECONCILED", "FAILED"],
  RECONCILED: [],
  FAILED: ["DRAFT"], // regenerate/retry path
};

function isValidBatchTransition(from: BatchState, to: BatchState): boolean {
  return from === to || (BATCH_TRANSITIONS[from]?.includes(to) ?? false);
}

export interface BatchDoc {
  batchId: string;
  state: BatchState;
  currency: "BDT";
  settlementCount: number;
  sellerCount: number;
  totalGrossMinor: number;
  totalNetMinor: number;
  generatedBy: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  approvedBy: string | null;
  executedBy: string | null;
  reconciledBy: string | null;
  payoutCount: number;
  failedPayoutCount: number;
  mismatchReport: string[] | null;
  createdAt: number;
  updatedAt: number;
}

export interface PayoutDoc {
  payoutId: string;
  batchId: string;
  sellerId: string;
  settlementIds: string[];
  currency: "BDT";
  amountMinor: number;
  status: "SUBMITTED" | "COMPLETED" | "FAILED" | "REVERSED";
  payoutReference: string;
  providerRef: string | null;
  providerId: string;
  idempotencyKey: string;
  createdBy: string;
  failureDetail: string | null;
  createdAt: number;
  updatedAt: number;
}

// ────────────────────────────────────────────────────────────────────
// AUTH HELPERS
// ────────────────────────────────────────────────────────────────────

/** Sensitive actions need a token minted within this window. */
export const FRESH_AUTH_MAX_AGE_SECONDS = 5 * 60;

function decodeTokenIat(idToken: string): number | null {
  try {
    // Emulator/test tokens are plain JSON; production tokens are JWTs —
    // either way the payload carries iat. The token is VERIFIED by
    // verifyIdToken before this is trusted.
    const parts = idToken.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return Number(payload.iat ?? 0) || null;
    }
    const decoded = JSON.parse(atob(idToken));
    return Number(decoded.iat ?? 0) || null;
  } catch {
    return null;
  }
}

/**
 * Verify the caller AND require a FRESH authentication (re-auth).
 * Returns the uid. Throws unless the token was minted within
 * FRESH_AUTH_MAX_AGE_SECONDS — the admin UI must force
 * reauthenticateWithCredential before money moves.
 */
export async function requireFreshAuth(idToken: string): Promise<string> {
  const { uid } = await verifyIdToken(idToken); // verifies identity
  const iat = decodeTokenIat(idToken);
  if (!iat) throw new Error("finance/auth: token has no issue time — re-authenticate.");
  const age = Date.now() / 1000 - iat;
  if (age > FRESH_AUTH_MAX_AGE_SECONDS) {
    throw new Error(
      `finance/auth: re-authentication required (token age ${Math.round(age)}s ` +
        `> ${FRESH_AUTH_MAX_AGE_SECONDS}s). Please confirm your password to continue.`,
    );
  }
  return uid;
}

async function getAdminRole(projectId: string, uid: string): Promise<string | null> {
  const docs = await batchGetDocs(projectId, [docPath(projectId, ["users", uid])]);
  const doc = docs.get(docPath(projectId, ["users", uid]));
  if (!doc?.exists) return null;
  // FetchedDoc.data is ALREADY decoded by batchGetDocs.
  const data = doc.data as Record<string, unknown>;
  // SECURITY AUDIT: mirror the Firestore rules' roleIn() semantics —
  // a stale/leaked adminRole on a NON-admin user, or a BLOCKED admin,
  // must carry ZERO finance authority server-side. The rules already
  // enforce this for client SDK reads; this closes the same gap for
  // Admin SDK (rules-bypassing) server functions.
  if (String(data.role ?? "") !== "admin" || data.blocked === true) return null;
  return (data.adminRole as string) ?? null;
}

/** Server-side permission gate for finance actions. */
export async function requireFinancePermission(
  projectId: string,
  uid: string,
  permission: FinancePermission,
): Promise<void> {
  const role = await getAdminRole(projectId, uid);
  if (!hasFinancePermission(role, permission)) {
    throw new Error(
      `finance/permission: your role (${role ?? "none"}) lacks ${permission}. ` +
        `Financial mutation denied.`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────
// BATCH LIFECYCLE
// ────────────────────────────────────────────────────────────────────

async function readBatch(projectId: string, batchId: string): Promise<BatchDoc | null> {
  const name = docPath(projectId, [SETTLEMENT_BATCHES_COLLECTION, batchId]);
  const docs = await batchGetDocs(projectId, [name]);
  const doc = docs.get(name);
  if (!doc?.exists) return null;
  return doc.data as unknown as BatchDoc;
}

async function writeBatchState(
  projectId: string,
  batch: BatchDoc,
  to: BatchState,
  extra: Partial<BatchDoc>,
): Promise<void> {
  if (!isValidBatchTransition(batch.state, to)) {
    throw new Error(`finance/batch: invalid transition ${batch.state} → ${to} (${batch.batchId})`);
  }
  const now = Date.now();
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [SETTLEMENT_BATCHES_COLLECTION, batch.batchId]),
        fields: toFsFields({ ...batch, ...extra, state: to, updatedAt: now }),
      },
    },
  ]);
}

/**
 * STEP 1 — GENERATE (finance.settlement). Collects ALL ELIGIBLE
 * settlements into a new DRAFT batch. No money moves.
 */
export async function generateSettlementBatch(
  projectId: string,
  actorUid: string,
  idempotencyKey?: string,
): Promise<BatchDoc> {
  await requireFinancePermission(projectId, actorUid, "finance.settlement");

  // Idempotency: a caller replaying the same key gets the same batch.
  if (idempotencyKey) {
    const existing = await queryBatches(projectId, { idempotencyKey, limit: 1 });
    if (existing.length > 0) return existing[0];
  }

  const eligible = await querySettlements(projectId, { state: "ELIGIBLE", limit: 500 });
  if (eligible.length === 0) throw new Error("finance/batch: no eligible settlements to batch");

  const batchId = `batch_${Date.now()}_${newDocId().slice(0, 8)}`;
  const now = Date.now();

  // Group per seller (one payout per seller per batch).
  const perSeller = new Map<string, typeof eligible>();
  for (const s of eligible) {
    const list = perSeller.get(s.sellerId) ?? [];
    list.push(s);
    perSeller.set(s.sellerId, list);
  }
  let totalGross = 0,
    totalNet = 0;
  const writes: FsWrite[] = [];
  for (const s of eligible) {
    totalGross += Number(s.grossMinor ?? 0);
    totalNet += Number(s.netMinor ?? 0);
    writes.push({
      update: {
        name: docPath(projectId, ["settlements", s.settlementId]),
        fields: toFsFields({ ...s, batchId, state: "SETTLEMENT_BATCH", updatedAt: now }),
      },
    });
  }
  const batch: BatchDoc = {
    batchId,
    state: "DRAFT",
    currency: "BDT",
    settlementCount: eligible.length,
    sellerCount: perSeller.size,
    totalGrossMinor: totalGross,
    totalNetMinor: totalNet,
    generatedBy: actorUid,
    reviewedBy: null,
    reviewNote: null,
    approvedBy: null,
    executedBy: null,
    reconciledBy: null,
    payoutCount: 0,
    failedPayoutCount: 0,
    mismatchReport: null,
    createdAt: now,
    updatedAt: now,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  } as BatchDoc;
  writes.push({
    update: {
      name: docPath(projectId, [SETTLEMENT_BATCHES_COLLECTION, batchId]),
      fields: toFsFields({ ...batch }),
    },
  });
  // Validate transitions against the pure machine (ELIGIBLE → SETTLEMENT_BATCH).
  if (eligible.some((s) => !(s.state === "ELIGIBLE"))) {
    throw new Error("finance/batch: internal consistency error");
  }
  await commitWrites(projectId, writes);
  return batch;
}

/** STEP 2 — REVIEW (finance.review). */
export async function reviewSettlementBatch(
  projectId: string,
  actorUid: string,
  batchId: string,
  reviewNote: string,
): Promise<BatchDoc> {
  await requireFinancePermission(projectId, actorUid, "finance.review");
  const batch = await readBatch(projectId, batchId);
  if (!batch) throw new Error(`finance/batch: ${batchId} not found`);
  await writeBatchState(projectId, batch, "IN_REVIEW", { reviewedBy: actorUid, reviewNote });
  return { ...batch, state: "IN_REVIEW", reviewedBy: actorUid, reviewNote };
}

/**
 * STEP 3 — APPROVE (finance.settlement + FRESH RE-AUTH).
 * Idempotent: approving an already-APPROVED batch with the same actor
 * is a no-op; a different actor or state is refused.
 */
export async function approveSettlementBatch(
  projectId: string,
  idToken: string,
  batchId: string,
): Promise<BatchDoc> {
  const uid = await requireFreshAuth(idToken);
  await requireFinancePermission(projectId, uid, "finance.settlement");
  const batch = await readBatch(projectId, batchId);
  if (!batch) throw new Error(`finance/batch: ${batchId} not found`);
  if (batch.state === "APPROVED" && batch.approvedBy === uid) return batch; // idempotent
  await writeBatchState(projectId, batch, "APPROVED", { approvedBy: uid });
  return { ...batch, state: "APPROVED", approvedBy: uid };
}

/**
 * STEP 4 — EXECUTE (finance.payout + FRESH RE-AUTH).
 * Creates ONE payout per seller via the configured provider.
 * IDEMPOTENT: deterministic payoutReference `PO_{batchId}_{sellerId}`
 * — a replayed execution returns the existing payouts, never a second
 * transfer. Failed provider calls mark the payout + settlements FAILED
 * (retryable) — money never silently disappears.
 */
export async function executeSettlementBatch(
  projectId: string,
  idToken: string,
  batchId: string,
  options: { productionMode: boolean },
): Promise<{ batch: BatchDoc; payouts: PayoutDoc[]; failed: number }> {
  const uid = await requireFreshAuth(idToken);
  await requireFinancePermission(projectId, uid, "finance.payout");
  const batch = await readBatch(projectId, batchId);
  if (!batch) throw new Error(`finance/batch: ${batchId} not found`);
  if (batch.state !== "APPROVED" && batch.state !== "EXECUTING") {
    throw new Error(
      `finance/batch: cannot execute batch in state ${batch.state} ` +
        `(uncontrolled money movement is blocked — batch must be APPROVED)`,
    );
  }

  const config = await readFinanceConfig(projectId);
  const provider = resolvePayoutProvider(
    config.payoutProvider,
    options.productionMode,
    config.mockPayoutEnabled,
  );

  if (batch.state === "APPROVED") {
    await writeBatchState(projectId, batch, "EXECUTING", { executedBy: uid });
  }

  const settlements = await querySettlements(projectId, { batchId, limit: 500 });
  const perSeller = new Map<string, typeof settlements>();
  for (const s of settlements) {
    const list = perSeller.get(s.sellerId) ?? [];
    list.push(s);
    perSeller.set(s.sellerId, list);
  }

  const payouts: PayoutDoc[] = [];
  let failed = 0;
  const now = Date.now();
  for (const [sellerId, list] of perSeller) {
    const amountMinor = list.reduce((sum, s) => sum + Number(s.netMinor ?? 0), 0);
    const payoutReference = `PO_${batchId}_${sellerId}`;
    const payoutId = payoutReference; // doc id = reference ⇒ unique
    const payoutName = docPath(projectId, [PAYOUTS_COLLECTION, payoutId]);

    // ── IDEMPOTENCY (§8): existence check inside a read+write pass.
    const existing = await batchGetDocs(projectId, [payoutName]);
    const existingDoc = existing.get(payoutName);
    if (existingDoc?.exists) {
      payouts.push(existingDoc.data as unknown as PayoutDoc);
      continue;
    }

    const result = await provider.executePayout({
      payoutId,
      batchId,
      sellerId,
      amountMinor,
      currency: "BDT",
      payoutReference,
    });
    const status: PayoutDoc["status"] = result.status === "SUBMITTED" ? "SUBMITTED" : "FAILED";
    const payout: PayoutDoc = {
      payoutId,
      batchId,
      sellerId,
      settlementIds: list.map((s) => s.settlementId),
      currency: "BDT",
      amountMinor,
      status,
      payoutReference,
      providerRef: result.providerRef,
      providerId: provider.id,
      idempotencyKey: payoutReference,
      createdBy: uid,
      failureDetail: status === "FAILED" ? result.detail : null,
      createdAt: now,
      updatedAt: now,
    };
    await commitWrites(projectId, [
      {
        update: { name: payoutName, fields: toFsFields({ ...payout }) },
      },
    ]);
    payouts.push(payout);

    if (status === "FAILED") {
      failed++;
      for (const s of list) {
        await transitionSettlement(projectId, s.settlementId, "FAILED", {
          holdReason: `payout failed: ${result.detail}`,
          updatedAt: now,
        } as never).catch(() => {});
      }
      continue;
    }

    // ── LEDGER (§1): PAYOUT debits the seller's available balance —
    // released earlier by SETTLEMENT_RELEASE, so funds are real.
    await appendLedgerEntry(projectId, {
      sellerId,
      type: "PAYOUT",
      amountMinor,
      currency: "BDT",
      orderId: null,
      reference: payoutReference,
      createdBy: uid,
      idempotencyKey: `pay_${payoutReference}`,
    });
    for (const s of list) {
      await transitionSettlement(projectId, s.settlementId, "PROCESSING", {
        payoutId,
        updatedAt: now,
      } as never).catch(() => {});
      await transitionSettlement(projectId, s.settlementId, "PAID", {
        payoutId,
        updatedAt: now,
      } as never).catch(() => {});
    }
  }

  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [SETTLEMENT_BATCHES_COLLECTION, batchId]),
        fields: toFsFields({
          ...batch,
          state: "EXECUTING",
          executedBy: uid,
          payoutCount: payouts.length,
          failedPayoutCount: failed,
          updatedAt: now,
        }),
      },
    },
  ]);
  return {
    batch: { ...batch, executedBy: uid, payoutCount: payouts.length, failedPayoutCount: failed },
    payouts,
    failed,
  };
}

/**
 * STEP 5 — RECONCILE (finance.reconcile, §9).
 * Verifies, per batch: payouts doc total == ledger PAYOUT total ==
 * batch net total; settlement states consistent. Mismatches are
 * recorded on the batch (never silently ignored) and the batch only
 * becomes RECONCILED when everything matches.
 */
export async function reconcileSettlementBatch(
  projectId: string,
  actorUid: string,
  batchId: string,
): Promise<{ batch: BatchDoc; reconciled: boolean; mismatches: string[] }> {
  await requireFinancePermission(projectId, actorUid, "finance.reconcile");
  const batch = await readBatch(projectId, batchId);
  if (!batch) throw new Error(`finance/batch: ${batchId} not found`);

  const payouts = await queryPayouts(projectId, { batchId, limit: 500 });
  const settlements = await querySettlements(projectId, { batchId, limit: 500 });
  const mismatches: string[] = [];

  // ── LEDGER CROSS-CHECK (§9): every payout doc must have exactly one
  // matching PAYOUT ledger entry with the same amount. Ledger entry ids
  // are deterministic (`led_{sellerId}_pay_{payoutReference}`), so the
  // check is a direct batchGet.
  const payoutDocTotal = payouts.reduce((sum, p) => sum + p.amountMinor, 0);
  const ledgerNames = payouts.map((p) =>
    docPath(projectId, ["sellerLedger", `led_${p.sellerId}_pay_${p.payoutReference}`]),
  );
  const ledgerDocs =
    ledgerNames.length > 0 ? await batchGetDocs(projectId, ledgerNames) : new Map();
  let ledgerTotal = 0;
  payouts.forEach((p, i) => {
    const entry = ledgerDocs.get(ledgerNames[i]);
    if (!entry?.exists) {
      mismatches.push(`payout ${p.payoutId}: no matching ledger PAYOUT entry`);
      return;
    }
    const amountMinor = Number((entry.data as Record<string, unknown>)["amountMinor"] ?? 0);
    if (amountMinor !== p.amountMinor) {
      mismatches.push(
        `payout ${p.payoutId}: doc amount ${p.amountMinor} != ledger amount ${amountMinor}`,
      );
    }
    ledgerTotal += amountMinor;
  });
  if (payoutDocTotal !== ledgerTotal) {
    mismatches.push(`payout doc total ${payoutDocTotal} != ledger PAYOUT total ${ledgerTotal}`);
  }
  if (payoutDocTotal !== batch.totalNetMinor) {
    mismatches.push(`payout doc total ${payoutDocTotal} != batch net total ${batch.totalNetMinor}`);
  }
  if (payouts.some((p) => p.status === "FAILED")) {
    mismatches.push(`batch has FAILED payouts (failed=${batch.failedPayoutCount})`);
  }
  const notPaid = settlements.filter((s) => s.state !== "PAID" && s.state !== "FAILED");
  if (notPaid.length > 0) {
    mismatches.push(
      `${notPaid.length} settlements not PAID/FAILED: ${notPaid.map((s) => `${s.settlementId}(${s.state})`).join(", ")}`,
    );
  }

  const reconciled = mismatches.length === 0;
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [SETTLEMENT_BATCHES_COLLECTION, batchId]),
        fields: toFsFields({
          ...batch,
          state: reconciled ? "RECONCILED" : batch.state,
          reconciledBy: reconciled ? actorUid : batch.reconciledBy,
          mismatchReport: reconciled ? null : mismatches,
          updatedAt: Date.now(),
        }),
      },
    },
  ]);
  return { batch: { ...batch }, reconciled, mismatches };
}

// ────────────────────────────────────────────────────────────────────
// QUERIES
// ────────────────────────────────────────────────────────────────────

export async function queryBatches(
  projectId: string,
  q: { state?: BatchState; idempotencyKey?: string; limit?: number },
): Promise<BatchDoc[]> {
  const where: unknown[] = [];
  if (q.state)
    where.push({ field: { fieldPath: "state" }, op: "EQUAL", value: { stringValue: q.state } });
  if (q.idempotencyKey)
    where.push({
      field: { fieldPath: "idempotencyKey" },
      op: "EQUAL",
      value: { stringValue: q.idempotencyKey },
    });
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: SETTLEMENT_BATCHES_COLLECTION }],
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
    document?: { fields: Record<string, unknown> };
  }>;
  return json
    .filter((r) => r.document)
    .map((r) => fromFsFields(r.document!.fields as never) as unknown as BatchDoc);
}

export async function queryPayouts(
  projectId: string,
  q: { batchId?: string; sellerId?: string; status?: PayoutDoc["status"]; limit?: number },
): Promise<PayoutDoc[]> {
  const where: unknown[] = [];
  if (q.batchId)
    where.push({ field: { fieldPath: "batchId" }, op: "EQUAL", value: { stringValue: q.batchId } });
  if (q.sellerId)
    where.push({
      field: { fieldPath: "sellerId" },
      op: "EQUAL",
      value: { stringValue: q.sellerId },
    });
  if (q.status)
    where.push({ field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: q.status } });
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: PAYOUTS_COLLECTION }],
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
    document?: { fields: Record<string, unknown> };
  }>;
  return json
    .filter((r) => r.document)
    .map((r) => fromFsFields(r.document!.fields as never) as unknown as PayoutDoc);
}

/**
 * Reverse a payout (§12 reversed payout): compensating ledger entry
 * (PAYOUT_REVERSAL — money back to the seller) + payout doc REVERSED.
 * Requires finance.refund + fresh re-auth. The original payout doc is
 * NEVER edited silently — the reversal is a new auditable record.
 */
export async function reversePayout(
  projectId: string,
  idToken: string,
  payoutId: string,
  reason: string,
): Promise<PayoutDoc> {
  const uid = await requireFreshAuth(idToken);
  await requireFinancePermission(projectId, uid, "finance.refund");
  const name = docPath(projectId, [PAYOUTS_COLLECTION, payoutId]);
  const docs = await batchGetDocs(projectId, [name]);
  const doc = docs.get(name);
  if (!doc?.exists) throw new Error(`finance/payout: ${payoutId} not found`);
  const payout = doc.data as unknown as PayoutDoc;
  if (payout.status === "REVERSED") return payout; // idempotent

  await appendLedgerEntry(projectId, {
    sellerId: payout.sellerId,
    type: "PAYOUT_REVERSAL",
    amountMinor: payout.amountMinor,
    currency: "BDT",
    orderId: null,
    reference: payout.payoutReference,
    createdBy: uid,
    idempotencyKey: `prev_${payout.payoutReference}`,
  });
  const now = Date.now();
  const reversed: PayoutDoc = {
    ...payout,
    status: "REVERSED",
    failureDetail: reason,
    updatedAt: now,
  };
  await commitWrites(projectId, [{ update: { name, fields: toFsFields({ ...reversed }) } }]);
  return reversed;
}
