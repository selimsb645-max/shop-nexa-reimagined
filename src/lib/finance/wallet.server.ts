/**
 * AVENTA SHOP — Seller Wallet & Withdrawal v2 (Wallet & Transaction Ledger)
 *
 * SITS ON TOP OF THE LEDGER-FIRST ENGINE (ledger.server.ts):
 *  - Wallet  = the `sellerFinance/{uid}` balance doc (server-authoritative,
 *    NEVER client-computed). Every mutation is a ledger entry.
 *  - Ledger  = the append-only `sellerLedger` collection — the audit trail.
 *  - Withdrawals reserve funds via SETTLEMENT_HOLD (atomic, in the same
 *    tx as the withdrawal request doc), then release+payout on approval
 *    or release-only on rejection. No double-spend: the ledger invariant
 *    (available >= 0) is enforced INSIDE the Firestore transaction.
 *
 * REUSE (nothing duplicated):
 *  - appendLedgerEntry — atomic entry + balance doc write
 *  - requireFinancePermission / requireFreshAuth (settlementBatch.server)
 *  - finance permissions (permissions.ts) — finance.read / finance.adjust /
 *    finance.payout / finance.reconcile
 *  - activityLogs audit rows (same shape as orderWorkflow audit handler)
 *  - sellers/{uid}/withdrawals docs (legacy collection, v2 fields added
 *    additively; rules already deny client writes)
 *
 * ALL AMOUNTS: integer paisa internally; the transport layer converts
 * taka → paisa exactly once via toMinor().
 */

import {
  docPath,
  batchGetDocs,
  commitWrites,
  runFirestoreQuery,
  newDocId,
  toFsFields,
  fromFsFields,
  type FsWrite,
} from "../firebase-admin.server";
import {
  appendLedgerEntry,
  getSellerBalances,
  SELLER_FINANCE_COLLECTION,
  SELLER_LEDGER_COLLECTION,
  WALLET_STATUSES,
  type LedgerEntry,
  type LedgerEntryType,
  type WalletStatus,
} from "./ledger.server";
import { toMinor, type Currency } from "./money";
import { SETTLEMENTS_COLLECTION, settlementDocId } from "./settlements.server";
import { requireFinancePermission, requireFreshAuth } from "./settlementBatch.server";
import { querySellerLedger, computeFinanceDashboard } from "./reconcile.server";
import { verifyLedgerIntegrity } from "./ledger.server";

export const SELLERS_COLLECTION = "sellers";
export const WITHDRAWALS_COLLECTION = "withdrawals"; // sellers/{uid}/withdrawals
export const ACTIVITY_LOGS_COLLECTION = "activityLogs";
export const SELLER_NOTIFICATIONS_COLLECTION = "notifications";

export type WithdrawalMethod = "bank" | "bkash" | "nagad" | "rocket";
export const WITHDRAWAL_METHODS: readonly WithdrawalMethod[] = ["bank", "bkash", "nagad", "rocket"];

/** Withdrawal lifecycle (spec §15). */
export const WITHDRAWAL_STATUSES = [
  "REQUESTED",
  "PROCESSING",
  "COMPLETED",
  "REJECTED",
  "FAILED",
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

/** Server-side minimum withdrawal: ৳10 = 1000 paisa. */
export const MIN_WITHDRAWAL_MINOR = 1000;
/** Hard ceiling: ৳10,00,000 per request (manual settlement launch policy). */
export const MAX_WITHDRAWAL_MINOR = 100_000_000;

export interface SellerWallet {
  sellerId: string;
  currency: Currency;
  availableMinor: number;
  pendingMinor: number;
  totalEarnedMinor: number;
  totalWithdrawnMinor: number;
  status: WalletStatus;
  transactionCount: number;
  lastEntryAt: number | null;
  lastEntryType: LedgerEntryType | null;
  updatedAt: number | null;
}

/** Read a seller's wallet (server-authoritative). Missing docs are
 *  valid zero-balance ACTIVE wallets (lazily materialized on first
 *  ledger entry — spec §2 "initialize new seller wallets safely"). */
export async function getSellerWallet(projectId: string, sellerId: string): Promise<SellerWallet> {
  const name = docPath(projectId, [SELLER_FINANCE_COLLECTION, sellerId]);
  const docs = await batchGetDocs(projectId, [name]);
  const doc = docs.get(name);
  if (!doc?.exists) {
    return {
      sellerId,
      currency: "BDT",
      availableMinor: 0,
      pendingMinor: 0,
      totalEarnedMinor: 0,
      totalWithdrawnMinor: 0,
      status: "ACTIVE",
      transactionCount: 0,
      lastEntryAt: null,
      lastEntryType: null,
      updatedAt: null,
    };
  }
  const d = doc.data as Record<string, unknown>;
  return {
    sellerId,
    currency: "BDT",
    availableMinor: Number(d.availableMinor ?? 0),
    pendingMinor: Number(d.heldMinor ?? 0),
    totalEarnedMinor: Number(d.totalEarnedMinor ?? 0),
    totalWithdrawnMinor: Number(d.paidOutMinor ?? 0),
    status: (WALLET_STATUSES as readonly string[]).includes(String(d.status ?? "ACTIVE"))
      ? (String(d.status) as WalletStatus)
      : "ACTIVE",
    transactionCount: Number(d.entrySeq ?? 0),
    lastEntryAt: d.lastEntryAt != null ? Number(d.lastEntryAt) : null,
    lastEntryType: (d.lastEntryType as LedgerEntryType | undefined) ?? null,
    updatedAt: d.updatedAt != null ? Number(d.updatedAt) : null,
  };
}

export interface LedgerPage {
  entries: LedgerEntry[];
  /** Cursor = last entry seq of the page; pass back for the next page. */
  nextBefore: number | null;
  hasMore: boolean;
}

/** Paginated, cursor-based ledger history (newest first). Filtering by
 *  type/status/ref happens in the query — never a full-collection scan. */
export async function queryWalletLedgerPage(
  projectId: string,
  sellerId: string,
  opts: { type?: LedgerEntryType | null; before?: number | null; limit?: number } = {},
): Promise<LedgerPage> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const where: Record<string, unknown>[] = [
    {
      fieldFilter: {
        field: { fieldPath: "sellerId" },
        op: "EQUAL",
        value: { stringValue: sellerId },
      },
    },
  ];
  if (opts.type) {
    where.push({
      fieldFilter: { field: { fieldPath: "type" }, op: "EQUAL", value: { stringValue: opts.type } },
    });
  }
  if (opts.before != null) {
    where.push({
      fieldFilter: {
        field: { fieldPath: "seq" },
        op: "LESS_THAN",
        value: { integerValue: String(opts.before) },
      },
    });
  }
  const json = (await runFirestoreQuery(projectId, {
    from: [{ collectionId: SELLER_LEDGER_COLLECTION }],
    where: { compositeFilter: { op: "AND", filters: where } },
    orderBy: [{ field: { fieldPath: "seq" }, direction: "DESCENDING" }],
    limit: limit + 1,
  })) as Array<{ document?: { fields: Record<string, unknown> } }>;

  const rows = json.filter((r) => r.document);
  const hasMore = rows.length > limit;
  const entries = rows
    .slice(0, limit)
    .map((r) =>
      decodeLedgerEntry(fromFsFields(r.document!.fields as never) as Record<string, unknown>),
    );
  return {
    entries,
    nextBefore: entries.length > 0 ? entries[entries.length - 1].seq : null,
    hasMore,
  };
}

function decodeLedgerEntry(fields: Record<string, unknown>): LedgerEntry {
  const f = fields as Record<string, never> as Record<string, unknown>;
  const g = (k: string) => (f[k] !== undefined && f[k] !== null ? f[k] : null);
  return {
    transactionId: String(f["transactionId"] ?? ""),
    seq: Number(f["seq"] ?? 0),
    sellerId: String(f["sellerId"] ?? ""),
    type: String(f["type"]) as LedgerEntryType,
    amountMinor: Number(f["amountMinor"] ?? 0),
    currency: "BDT",
    orderId: g("orderId") as string | null,
    reference: g("reference") as string | null,
    direction: (g("direction") as "CREDIT" | "DEBIT" | null) ?? "DEBIT",
    status: "COMPLETED",
    createdBy: String(f["createdBy"] ?? "system"),
    balanceBefore: Number(f["balanceBefore"] ?? 0),
    balanceAfter: Number(f["balanceAfter"] ?? 0),
    heldBefore: Number(f["heldBefore"] ?? 0),
    heldAfter: Number(f["heldAfter"] ?? 0),
    createdAt: Number(f["createdAt"] ?? 0),
  };
}

// ────────────────────────────────────────────────────────────────────
// AUDIT LOG (reuses the orderWorkflow activityLogs shape)
// ────────────────────────────────────────────────────────────────────

function auditLogWrite(projectId: string, logId: string, fields: Record<string, unknown>): FsWrite {
  return {
    update: {
      name: docPath(projectId, [ACTIVITY_LOGS_COLLECTION, logId]),
      fields: toFsFields({
        actorUid: fields.actorUid,
        actorEmail: fields.actorEmail ?? null,
        action: fields.action,
        targetType: "finance",
        targetId: fields.targetId ?? null,
        sellerId: fields.sellerId ?? null,
        walletId: fields.sellerId ?? null,
        transactionId: fields.transactionId ?? null,
        reason: fields.reason ?? null,
        meta: fields.meta ?? null,
        createdAt: fields.createdAt ?? Date.now(),
      }),
    },
    currentDocument: { exists: false },
  };
}

// ────────────────────────────────────────────────────────────────────
// SELLER WITHDRAWAL (v2 — ledger-backed, atomic reservation)
// ────────────────────────────────────────────────────────────────────

/** Mask the payout destination for display (security). */
function maskDestination(method: string, destination: string): string {
  const d = destination.trim();
  if (method === "bank") {
    const last4 = d.slice(-4);
    return `•••• •••• ${last4}`;
  }
  if (d.length <= 4) return `•••• ${d}`;
  return `•••• ${d.slice(-4)}`;
}

export interface WithdrawalRequestResult {
  withdrawalId: string;
  amountMinor: number;
  availableAfterMinor: number;
  pendingAfterMinor: number;
}

/**
 * Seller requests a withdrawal. One atomic transaction:
 *   SETTLEMENT_HOLD ledger entry + wallet doc update + withdrawal doc.
 * If any part fails, nothing lands — funds can never be reserved
 * without a matching request document (and vice versa).
 */
export async function requestWalletWithdrawal(
  projectId: string,
  uid: string,
  input: { amountTaka: number; method: WithdrawalMethod; destination: string },
): Promise<WithdrawalRequestResult> {
  if (!WITHDRAWAL_METHODS.includes(input.method)) {
    throw new Error("wallet/withdraw: unsupported withdrawal method.");
  }
  const destination = input.destination.trim();
  if (destination.length < 4 || destination.length > 200) {
    throw new Error("wallet/withdraw: enter a valid payout destination.");
  }
  if (!Number.isFinite(input.amountTaka) || input.amountTaka <= 0) {
    throw new Error("wallet/withdraw: enter a valid amount.");
  }
  // Float taka → integer paisa exactly ONCE, server-side.
  const amountMinor = toMinor(input.amountTaka).amountMinor;
  if (amountMinor < MIN_WITHDRAWAL_MINOR) {
    throw new Error("wallet/withdraw: minimum withdrawal amount is ৳10.");
  }
  if (amountMinor > MAX_WITHDRAWAL_MINOR) {
    throw new Error("wallet/withdraw: amount exceeds the per-request limit.");
  }

  // Pre-checks for clear errors; the tx invariant is the hard backstop.
  const wallet = await getSellerWallet(projectId, uid);
  if (wallet.status !== "ACTIVE") {
    throw new Error(
      wallet.status === "CLOSED"
        ? "wallet/withdraw: this wallet is closed."
        : `wallet/withdraw: wallet is ${wallet.status} — withdrawals are blocked.`,
    );
  }
  if (amountMinor > wallet.availableMinor) {
    throw new Error("wallet/withdraw: INSUFFICIENT_BALANCE.");
  }

  const withdrawalId = newDocId();
  const now = Date.now();
  const masked = maskDestination(input.method, destination);

  await appendLedgerEntry(projectId, {
    sellerId: uid,
    type: "SETTLEMENT_HOLD",
    amountMinor,
    currency: "BDT",
    reference: withdrawalId,
    createdBy: uid,
    idempotencyKey: `wd_${withdrawalId}`,
    createdAt: now,
    extraWrites: [
      {
        update: {
          name: docPath(projectId, [SELLERS_COLLECTION, uid, WITHDRAWALS_COLLECTION, withdrawalId]),
          fields: toFsFields({
            sellerId: uid,
            withdrawalId,
            amountMinor,
            currency: "BDT",
            engine: "v2",
            method: input.method,
            destination: masked,
            status: "REQUESTED",
            note: null,
            requestedAt: now,
            processedAt: null,
            processedBy: null,
            reviewNote: null,
            ledgerKeys: {
              hold: `wd_${withdrawalId}`,
              release: `wd_${withdrawalId}_release`,
              payout: `wd_${withdrawalId}_payout`,
            },
          }),
        },
        currentDocument: { exists: false },
      },
    ],
  });

  const after = await getSellerBalances(projectId, uid);
  return {
    withdrawalId,
    amountMinor,
    availableAfterMinor: after.availableMinor,
    pendingAfterMinor: after.heldMinor,
  };
}

export interface WithdrawalDoc {
  withdrawalId: string;
  sellerId: string;
  amountMinor: number;
  currency: string;
  status: WithdrawalStatus;
  method: string;
  destination: string | null;
  note: string | null;
  requestedAt: number;
  processedAt: number | null;
  processedBy: string | null;
  reviewNote: string | null;
}

async function readWithdrawalDoc(
  projectId: string,
  sellerId: string,
  withdrawalId: string,
): Promise<WithdrawalDoc> {
  const name = docPath(projectId, [
    SELLERS_COLLECTION,
    sellerId,
    WITHDRAWALS_COLLECTION,
    withdrawalId,
  ]);
  const docs = await batchGetDocs(projectId, [name]);
  const doc = docs.get(name);
  if (!doc?.exists) throw new Error("wallet/withdraw: withdrawal request not found.");
  const d = doc.data as Record<string, unknown>;
  return {
    withdrawalId,
    sellerId,
    amountMinor: Number(d.amountMinor ?? 0),
    currency: String(d.currency ?? "BDT"),
    status: String(d.status ?? "REQUESTED") as WithdrawalStatus,
    method: String(d.method ?? "bank"),
    destination: (d.destination as string | null) ?? null,
    note: (d.note as string | null) ?? null,
    requestedAt: Number(d.requestedAt ?? 0),
    processedAt: d.processedAt != null ? Number(d.processedAt) : null,
    processedBy: (d.processedBy as string | null) ?? null,
    reviewNote: (d.reviewNote as string | null) ?? null,
  };
}

/**
 * Admin processes a REQUESTED withdrawal.
 *  approve → SETTLEMENT_RELEASE then PAYOUT (held → paidOut).
 *  reject  → SETTLEMENT_RELEASE only (funds return to available).
 * Both paths are idempotent per (withdrawalId, action): ledger keys are
 * deterministic, so a crashed retry never double-posts.
 */
export async function processWalletWithdrawal(
  projectId: string,
  admin: { uid: string; email: string | null },
  input: { sellerId: string; withdrawalId: string; action: "approve" | "reject"; note?: string },
): Promise<{ status: WithdrawalStatus }> {
  // Defense in depth: permissions are ALSO enforced in the transport,
  // but the mutation itself re-checks server-side.
  await requireFinancePermission(
    projectId,
    admin.uid,
    input.action === "approve" ? "finance.payout" : "finance.settlement",
  );
  const wd = await readWithdrawalDoc(projectId, input.sellerId, input.withdrawalId);
  if (wd.status !== "REQUESTED" && wd.status !== "PROCESSING") {
    throw new Error(`wallet/withdraw: withdrawal already ${wd.status}.`);
  }
  if (wd.currency !== "BDT") {
    throw new Error("wallet/withdraw: CURRENCY_MISMATCH.");
  }
  const now = Date.now();
  const note = input.note?.trim() || null;

  // Re-check wallet status — a suspended wallet must not pay out.
  const wallet = await getSellerWallet(projectId, input.sellerId);
  if (wallet.status === "CLOSED" || (input.action === "approve" && wallet.status !== "ACTIVE")) {
    throw new Error(`wallet/withdraw: wallet is ${wallet.status} — cannot process payouts.`);
  }

  // 1) Release the reservation (held → available). Idempotent key.
  await appendLedgerEntry(projectId, {
    sellerId: input.sellerId,
    type: "SETTLEMENT_RELEASE",
    amountMinor: wd.amountMinor,
    currency: "BDT",
    reference: input.withdrawalId,
    createdBy: admin.uid,
    idempotencyKey: `wd_${input.withdrawalId}_release`,
    createdAt: now,
  });

  let finalStatus: WithdrawalStatus;
  if (input.action === "approve") {
    // 2) Post the payout (available → paidOut). Idempotent key.
    await appendLedgerEntry(projectId, {
      sellerId: input.sellerId,
      type: "PAYOUT",
      amountMinor: wd.amountMinor,
      currency: "BDT",
      reference: `PO_manual_${input.withdrawalId}`,
      createdBy: admin.uid,
      idempotencyKey: `wd_${input.withdrawalId}_payout`,
      createdAt: now,
    });
    finalStatus = "COMPLETED";
  } else {
    finalStatus = "REJECTED";
  }

  // 3) Update the withdrawal doc + notify + audit (atomic batch).
  const writes: FsWrite[] = [
    {
      update: {
        name: docPath(projectId, [
          SELLERS_COLLECTION,
          input.sellerId,
          WITHDRAWALS_COLLECTION,
          input.withdrawalId,
        ]),
        fields: toFsFields({
          status: finalStatus,
          processedAt: now,
          processedBy: admin.uid,
          reviewNote: note,
        }),
      },
      updateMask: { fieldPaths: ["status", "processedAt", "processedBy", "reviewNote"] },
    },
    {
      update: {
        name: docPath(projectId, [
          SELLERS_COLLECTION,
          input.sellerId,
          SELLER_NOTIFICATIONS_COLLECTION,
          newDocId(),
        ]),
        fields: toFsFields({
          type: "withdrawal",
          title: finalStatus === "COMPLETED" ? "Withdrawal processed" : "Withdrawal rejected",
          message:
            finalStatus === "COMPLETED"
              ? `Your withdrawal of ৳${(wd.amountMinor / 100).toFixed(2)} has been sent via ${wd.method}.`
              : `Your withdrawal of ৳${(wd.amountMinor / 100).toFixed(2)} was rejected.${note ? ` Note: ${note}` : ""}`,
          link: "/seller/wallet",
          read: false,
          createdAt: now,
        }),
      },
      currentDocument: { exists: false },
    },
    auditLogWrite(projectId, `act_wd_${input.withdrawalId}_${finalStatus.toLowerCase()}`, {
      actorUid: admin.uid,
      actorEmail: admin.email,
      action: finalStatus === "COMPLETED" ? "WITHDRAWAL_APPROVED" : "WITHDRAWAL_REJECTED",
      sellerId: input.sellerId,
      transactionId: input.withdrawalId,
      reason: note,
      meta: { amountMinor: wd.amountMinor, method: wd.method },
      createdAt: now,
    }),
  ];
  await commitWrites(projectId, writes);
  return { status: finalStatus };
}

/** List a seller's withdrawal requests (seller view — own only). */
export async function listSellerWithdrawals(
  projectId: string,
  sellerId: string,
  limit = 50,
): Promise<WithdrawalDoc[]> {
  // Direct REST list of the seller's withdrawals subcollection —
  // scoped to one seller (no cross-seller scan), newest first.
  const listRes = await fetch(
    `${firestoreBaseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}/${WITHDRAWALS_COLLECTION}?pageSize=${Math.min(limit, 100)}`,
    { headers: await serviceAuthHeaders() },
  );
  if (!listRes.ok) {
    throw new Error("wallet/withdrawals: could not read the withdrawal list.");
  }
  const json =
    (
      (await listRes.json()) as {
        documents?: Array<{ name?: string; fields: Record<string, unknown> }>;
      }
    ).documents ?? [];
  return json.map((r) => {
    const d = fromFsFields(r.fields as never) as Record<string, unknown>;
    return {
      withdrawalId: String(d["withdrawalId"] ?? ""),
      sellerId,
      amountMinor: Number(d["amountMinor"] ?? 0),
      currency: String(d["currency"] ?? "BDT"),
      status: String(d["status"] ?? "REQUESTED") as WithdrawalStatus,
      method: String(d["method"] ?? "bank"),
      destination: (d["destination"] as string | null) ?? null,
      note: (d["note"] as string | null) ?? null,
      requestedAt: Number(d["requestedAt"] ?? 0),
      processedAt: d["processedAt"] != null ? Number(d["processedAt"]) : null,
      processedBy: (d["processedBy"] as string | null) ?? null,
      reviewNote: (d["reviewNote"] as string | null) ?? null,
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// MANUAL ADJUSTMENTS (finance.adjust + fresh re-auth + reason)
// ────────────────────────────────────────────────────────────────────

export interface AdjustmentResult {
  transactionId: string;
  availableAfterMinor: number;
}

export async function postManualAdjustment(
  projectId: string,
  admin: { uid: string; email: string | null },
  input: {
    sellerId: string;
    amountTaka: number;
    direction: "CREDIT" | "DEBIT";
    reason: string;
    reference?: string;
  },
): Promise<AdjustmentResult> {
  await requireFinancePermission(projectId, admin.uid, "finance.adjust");
  const reason = input.reason.trim();
  if (reason.length < 10) {
    throw new Error("wallet/adjust: a reason of at least 10 characters is required.");
  }
  if (!Number.isFinite(input.amountTaka) || input.amountTaka <= 0) {
    throw new Error("wallet/adjust: INVALID_AMOUNT.");
  }
  const amountMinor = toMinor(input.amountTaka).amountMinor;
  const signed = input.direction === "CREDIT" ? amountMinor : -amountMinor;

  const wallet = await getSellerWallet(projectId, input.sellerId);
  if (wallet.status === "CLOSED" && input.direction === "DEBIT") {
    throw new Error("wallet/adjust: wallet is CLOSED — debits are blocked.");
  }

  const adjustmentId = newDocId();
  const now = Date.now();
  const entry = await appendLedgerEntry(projectId, {
    sellerId: input.sellerId,
    type: "ADJUSTMENT",
    amountMinor: signed,
    currency: "BDT",
    reference: input.reference?.trim() || `adj_${adjustmentId}`,
    createdBy: admin.uid,
    idempotencyKey: `adj_${adjustmentId}`,
    createdAt: now,
  });

  const writes: FsWrite[] = [
    auditLogWrite(projectId, `act_adj_${adjustmentId}`, {
      actorUid: admin.uid,
      actorEmail: admin.email,
      action: input.direction === "CREDIT" ? "MANUAL_CREDIT" : "MANUAL_DEBIT",
      sellerId: input.sellerId,
      transactionId: entry.transactionId,
      reason,
      meta: { amountMinor: signed },
      createdAt: now,
    }),
    {
      update: {
        name: docPath(projectId, [
          SELLERS_COLLECTION,
          input.sellerId,
          SELLER_NOTIFICATIONS_COLLECTION,
          newDocId(),
        ]),
        fields: toFsFields({
          type: "wallet",
          title: input.direction === "CREDIT" ? "Wallet credited" : "Wallet adjusted",
          message:
            input.direction === "CREDIT"
              ? `৳${(amountMinor / 100).toFixed(2)} was credited to your wallet. Reason: ${reason}`
              : `An adjustment of ৳${(amountMinor / 100).toFixed(2)} was applied to your wallet. Reason: ${reason}`,
          link: "/seller/wallet",
          read: false,
          createdAt: now,
        }),
      },
      currentDocument: { exists: false },
    },
  ];
  await commitWrites(projectId, writes);

  const after = await getSellerBalances(projectId, input.sellerId);
  return { transactionId: entry.transactionId, availableAfterMinor: after.availableMinor };
}

// ────────────────────────────────────────────────────────────────────
// WALLET STATUS MANAGEMENT (finance.adjust + fresh re-auth)
// ────────────────────────────────────────────────────────────────────

const WALLET_STATUS_TRANSITIONS: Record<WalletStatus, readonly WalletStatus[]> = {
  ACTIVE: ["SUSPENDED", "LOCKED", "CLOSED"],
  SUSPENDED: ["ACTIVE", "LOCKED", "CLOSED"],
  LOCKED: ["ACTIVE", "SUSPENDED", "CLOSED"],
  CLOSED: [], // terminal — financial history stays auditable
};

export async function setWalletStatus(
  projectId: string,
  admin: { uid: string; email: string | null },
  input: { sellerId: string; status: WalletStatus; reason: string },
): Promise<{ status: WalletStatus }> {
  await requireFinancePermission(projectId, admin.uid, "finance.adjust");
  const reason = input.reason.trim();
  if (reason.length < 10) {
    throw new Error("wallet/status: a reason of at least 10 characters is required.");
  }
  const wallet = await getSellerWallet(projectId, input.sellerId);
  const to = input.status;
  if (wallet.status === to) {
    return { status: to }; // idempotent no-op
  }
  const allowed = WALLET_STATUS_TRANSITIONS[wallet.status];
  if (!allowed.includes(to)) {
    throw new Error(
      `wallet/status: INVALID_STATE_TRANSITION ${wallet.status} → ${to}` +
        (wallet.status === "CLOSED" ? " (closed wallets are terminal)." : "."),
    );
  }
  const now = Date.now();
  const actionByStatus: Record<WalletStatus, string> = {
    ACTIVE: "WALLET_UNLOCKED",
    SUSPENDED: "WALLET_SUSPENDED",
    LOCKED: "WALLET_LOCKED",
    CLOSED: "WALLET_CLOSED",
  };
  const writes: FsWrite[] = [
    {
      update: {
        name: docPath(projectId, [SELLER_FINANCE_COLLECTION, input.sellerId]),
        fields: toFsFields({ status: to, updatedAt: now }),
      },
      updateMask: { fieldPaths: ["status", "updatedAt"] },
    },
    auditLogWrite(projectId, `act_ws_${input.sellerId}_${to.toLowerCase()}_${now}`, {
      actorUid: admin.uid,
      actorEmail: admin.email,
      action: actionByStatus[to],
      sellerId: input.sellerId,
      reason,
      meta: { from: wallet.status, to },
      createdAt: now,
    }),
  ];
  await commitWrites(projectId, writes);
  return { status: to };
}

// ────────────────────────────────────────────────────────────────────
// ADMIN VIEWS (finance.read)
// ────────────────────────────────────────────────────────────────────

export interface AdminWalletRow {
  sellerId: string;
  shopName: string | null;
  sellerStatus: string | null;
  wallet: SellerWallet;
}

/** List all seller wallets joined with seller profile basics. */
export async function listAdminWallets(
  projectId: string,
  adminUid: string,
  opts: { search?: string; status?: WalletStatus | null; limit?: number } = {},
): Promise<AdminWalletRow[]> {
  await requireFinancePermission(projectId, adminUid, "finance.read");
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const where: Record<string, unknown>[] = [];
  if (opts.status) {
    where.push({
      fieldFilter: {
        field: { fieldPath: "status" },
        op: "EQUAL",
        value: { stringValue: opts.status },
      },
    });
  }
  const json = (await runFirestoreQuery(projectId, {
    from: [{ collectionId: SELLER_FINANCE_COLLECTION }],
    ...(where.length > 0
      ? {
          where: where.length === 1 ? where[0] : { compositeFilter: { op: "AND", filters: where } },
        }
      : {}),
    limit,
  })) as Array<{ document?: { name?: string; fields: Record<string, unknown> } }>;

  const rows = json.filter((r) => r.document);
  // Join seller profiles for names (batched, bounded).
  const sellerIds = rows.map((r) => r.document!.name!.split("/").pop()!);
  const sellerDocs = await batchGetDocs(
    projectId,
    sellerIds.map((sid) => docPath(projectId, [SELLERS_COLLECTION, sid])),
  );

  const out: AdminWalletRow[] = [];
  for (const r of rows) {
    const sellerId = r.document!.name!.split("/").pop()!;
    const sellerDoc = sellerDocs.get(docPath(projectId, [SELLERS_COLLECTION, sellerId]));
    const sd = (sellerDoc?.exists ? sellerDoc.data : {}) as Record<string, unknown>;
    const d = fromFsFields(r.document!.fields as never) as Record<string, unknown>;
    const row: AdminWalletRow = {
      sellerId,
      shopName: (sd.shopName as string | undefined) ?? null,
      sellerStatus: (sd.status as string | undefined) ?? null,
      wallet: {
        sellerId,
        currency: "BDT",
        availableMinor: Number((d as Record<string, unknown>)["availableMinor"] ?? 0),
        pendingMinor: Number(d["heldMinor"] ?? 0),
        totalEarnedMinor: Number(d["totalEarnedMinor"] ?? 0),
        totalWithdrawnMinor: Number(d["paidOutMinor"] ?? 0),
        status: (WALLET_STATUSES as readonly string[]).includes(String(d["status"] ?? "ACTIVE"))
          ? (String(d["status"]) as WalletStatus)
          : "ACTIVE",
        transactionCount: Number(d["entrySeq"] ?? 0),
        lastEntryAt: d["lastEntryAt"] != null ? Number(d["lastEntryAt"]) : null,
        lastEntryType: (d["lastEntryType"] as LedgerEntryType | undefined) ?? null,
        updatedAt: d["updatedAt"] != null ? Number(d["updatedAt"]) : null,
      },
    };
    const q = (opts.search ?? "").trim().toLowerCase();
    if (
      q &&
      !(row.shopName ?? "").toLowerCase().includes(q) &&
      !row.sellerId.toLowerCase().includes(q)
    ) {
      continue;
    }
    out.push(row);
  }
  return out;
}

export interface AdminWalletDetail {
  wallet: SellerWallet;
  shopName: string | null;
  sellerStatus: string | null;
  ledger: LedgerPage;
  withdrawals: WithdrawalDoc[];
}

export async function getAdminWalletDetail(
  projectId: string,
  adminUid: string,
  sellerId: string,
  opts: { type?: LedgerEntryType | null; before?: number | null } = {},
): Promise<AdminWalletDetail> {
  await requireFinancePermission(projectId, adminUid, "finance.read");
  const [wallet, ledger, withdrawals, sellerDocs] = await Promise.all([
    getSellerWallet(projectId, sellerId),
    queryWalletLedgerPage(projectId, sellerId, {
      type: opts.type ?? null,
      before: opts.before ?? null,
    }),
    listSellerWithdrawals(projectId, sellerId, 25),
    batchGetDocs(projectId, [docPath(projectId, [SELLERS_COLLECTION, sellerId])]),
  ]);
  const sd = sellerDocs.get(docPath(projectId, [SELLERS_COLLECTION, sellerId]));
  const data = (sd?.exists ? sd.data : {}) as Record<string, unknown>;
  return {
    wallet,
    shopName: (data.shopName as string | undefined) ?? null,
    sellerStatus: (data.status as string | undefined) ?? null,
    ledger,
    withdrawals,
  };
}

// ────────────────────────────────────────────────────────────────────
// RECONCILIATION (finance.reconcile)
// ────────────────────────────────────────────────────────────────────

export interface ReconciliationReport {
  sellersChecked: number;
  mismatches: string[];
  dashboard: Awaited<ReturnType<typeof computeFinanceDashboard>> | null;
}

/**
 * Ledger replay vs stored wallet balances for every wallet. NEVER
 * auto-corrects — mismatches are flagged for a human decision (§26).
 */
export async function runWalletReconciliation(
  projectId: string,
  adminUid: string,
  sellerIds?: string[],
): Promise<ReconciliationReport> {
  await requireFinancePermission(projectId, adminUid, "finance.reconcile");
  let ids = sellerIds;
  if (!ids) {
    const json = (await runFirestoreQuery(projectId, {
      from: [{ collectionId: SELLER_FINANCE_COLLECTION }],
      limit: 500,
    })) as Array<{ document?: { name?: string } }>;
    ids = json.filter((r) => r.document).map((r) => r.document!.name!.split("/").pop()!);
  }
  const mismatches: string[] = [];
  for (const sellerId of ids) {
    const entries = await querySellerLedger(projectId, sellerId);
    if (entries.length === 0) continue;
    const integrity = await verifyLedgerIntegrity(projectId, sellerId, entries);
    if (!integrity.ok) mismatches.push(`seller ${sellerId}: ${integrity.mismatches.join("; ")}`);
  }
  const dashboard = ids.length > 0 ? await computeFinanceDashboard(projectId, ids) : null;
  return { sellersChecked: ids.length, mismatches, dashboard };
}

// ────────────────────────────────────────────────────────────────────
// LEGACY MIGRATION (spec §38 — never overwrite, deterministic ids)
// ────────────────────────────────────────────────────────────────────

interface StoredDocRaw {
  name?: string;
  fields: Record<string, unknown>;
}

/** Firestore REST base (emulator-aware) for direct document reads. */
function firestoreBaseUrl(projectId: string): string {
  const emulatorHost = Deno.env.get("FIRESTORE_EMULATOR_HOST");
  return emulatorHost
    ? `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function serviceAuthHeaders(): Promise<Record<string, string>> {
  const { getAccessToken } = await import("../firebase-admin.server");
  const token = await getAccessToken();
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

/**
 * Migrate legacy float-taka walletTx entries (sellers/{uid}/walletTx,
 * client-era ledger) into the v2 integer-paisa sellerLedger. Each
 * legacy doc becomes exactly one ledger entry with idempotency key
 * `migrated_{docId}` — re-running is a no-op. Chronological order is
 * preserved (running balances recomputed by the engine). Pending
 * legacy withdrawals are skipped (they never completed).
 */
export async function migrateLegacyWalletTx(
  projectId: string,
  adminUid: string,
  sellerId: string,
): Promise<{ migrated: number; skippedPending: number; skippedV2Covered: number }> {
  await requireFinancePermission(projectId, adminUid, "finance.adjust");
  // List the seller's legacy subcollection directly (REST collection
  // list; first page of 100 is enough for a migration pass — re-run
  // the function to page through larger histories).
  const listRes = await fetch(
    `${firestoreBaseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}/walletTx?pageSize=100`,
    { headers: await serviceAuthHeaders() },
  );
  if (!listRes.ok) {
    throw new Error("wallet/migrate: could not read the legacy wallet history.");
  }
  const json = ((await listRes.json()) as { documents?: Array<StoredDocRaw> }).documents ?? [];

  const rows = json
    .map((r) => {
      const d = fromFsFields(r.fields as never) as Record<string, unknown>;
      return {
        docId:
          String(r.name ?? "")
            .split("/")
            .pop() ?? newDocId(),
        type: String(d["type"] ?? "earning"),
        amount: Number(d["amount"] ?? 0),
        status: String(d["status"] ?? "completed"),
        orderId: (d["orderId"] as string | null) ?? null,
        createdAt: Number(d["createdAt"] ?? 0),
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt || a.docId.localeCompare(b.docId));

  let migrated = 0;
  let skippedPending = 0;
  // AUDIT FIX (money-flow audit, Sep 7 2026): v2-covered orders must
  // never be imported. The v2 engine has posted its own ledger entries
  // for every order since the workflow finance handler shipped, so
  // importing a legacy "earning" for the SAME order would double-credit
  // the seller's v2-available balance (directly withdrawable). Rows
  // tied to an order that has a v2 settlement (or any v2 ledger entry
  // for that order) are skipped instead; only pre-v2 / non-order rows
  // (topups, adjustments) still migrate.
  let skippedV2Covered = 0;
  const v2CoverageCache = new Map<string, boolean>();
  const isV2CoveredOrder = async (orderId: string): Promise<boolean> => {
    const cached = v2CoverageCache.get(orderId);
    if (cached !== undefined) return cached;
    const settlementName = docPath(projectId, [
      SETTLEMENTS_COLLECTION,
      settlementDocId(orderId, sellerId),
    ]);
    const docs = await batchGetDocs(projectId, [settlementName]);
    const covered = docs.get(settlementName)?.exists === true;
    v2CoverageCache.set(orderId, covered);
    return covered;
  };
  for (const row of rows) {
    if (row.status === "pending" || row.amount === 0) {
      skippedPending++;
      continue;
    }
    const rowOrderId = typeof row.orderId === "string" ? row.orderId : null;
    if (rowOrderId) {
      const v2Covered = await isV2CoveredOrder(rowOrderId);
      if (v2Covered) {
        skippedV2Covered++;
        continue;
      }
    }
    // Legacy float taka → paisa ONCE (display-level floats tolerated
    // only at this read boundary per money.ts rules).
    const amountMinor = toMinor(Math.abs(row.amount)).amountMinor * (row.amount < 0 ? -1 : 1);
    const type: LedgerEntryType =
      row.type === "withdrawal"
        ? "PAYOUT"
        : row.type === "refund"
          ? "REFUND_DEBIT"
          : row.type === "adjustment" || row.type === "bonus" || row.type === "topup"
            ? "ADJUSTMENT"
            : "ORDER_CREDIT";
    // Deterministic migration ids — skip docs already migrated (the
    // append itself is also idempotent; this keeps the counter honest).
    const existingEntry = docPath(projectId, [
      SELLER_LEDGER_COLLECTION,
      `led_${sellerId}_migrated_${row.docId}`,
    ]);
    const seen = await batchGetDocs(projectId, [existingEntry]);
    if (seen.get(existingEntry)?.exists) continue;
    await appendLedgerEntry(projectId, {
      sellerId,
      type,
      // ADJUSTMENT carries the sign; every other type takes the
      // absolute amount (direction comes from the type itself).
      amountMinor: type === "ADJUSTMENT" ? amountMinor : Math.abs(amountMinor),
      currency: "BDT",
      reference: `legacy:${row.docId}`,
      createdBy: "migration",
      idempotencyKey: `migrated_${row.docId}`,
      createdAt: row.createdAt > 0 ? row.createdAt : undefined,
    });
    migrated++;
  }
  return { migrated, skippedPending, skippedV2Covered };
}
