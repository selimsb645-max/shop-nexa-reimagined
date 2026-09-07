/**
 * AVENTA SHOP — Seller Financial Ledger (Prompt 04 §1, §10)
 *
 * LEDGER-FIRST ARCHITECTURE:
 *  - A seller's balance is NEVER a free-floating mutable number: every
 *    financial movement is an APPEND-ONLY ledger entry, and the balance
 *    doc (`sellerFinance/{uid}`) is only ever written INSIDE the same
 *    Firestore transaction that appends the entry — the two can never
 *    drift.
 *  - Entries are immutable: Firestore rules deny update/delete; the
 *    engine itself has no update path either. Corrections are NEW
 *    ADJUSTMENT transactions (never edits).
 *
 * ENTRY TYPES (§1):
 *   ORDER_CREDIT       available += amount
 *   COMMISSION_DEBIT   available -= amount
 *   SHIPPING_DEBIT     available -= amount
 *   REFUND_DEBIT       available -= amount
 *   SETTLEMENT_HOLD    available -= amount; held += amount
 *   SETTLEMENT_RELEASE available += amount; held -= amount
 *   PAYOUT             available -= amount; paidOut += amount
 *   PAYOUT_REVERSAL    available += amount; paidOut -= amount
 *   ADJUSTMENT         available += signedAmount (corrections only,
 *                      finance.adjust permission required upstream)
 *
 * All amounts are integer minor units (paisa), currency "BDT".
 * Invariants enforced in-transaction:
 *   available >= 0, held >= 0 — a payout/hold can never overdraw.
 *
 * IDEMPOTENCY: deterministic entry ids (`led_{orderId}_{sellerId}_{key}`)
 * make duplicate event replays no-ops (entry checked inside the tx).
 */

import {
  docPath,
  beginTransaction,
  batchGetDocs,
  batchGetDocsWithTx,
  commitWithTx,
  rollbackTransaction,
  newDocId,
  toFsFields,
  fromFsFields,
  type FsWrite,
} from "../firebase-admin.server";

export const SELLER_LEDGER_COLLECTION = "sellerLedger";
export const SELLER_FINANCE_COLLECTION = "sellerFinance";

export const LEDGER_ENTRY_TYPES = [
  "ORDER_CREDIT",
  "COMMISSION_DEBIT",
  "SHIPPING_DEBIT",
  "REFUND_DEBIT",
  "ADJUSTMENT",
  "SETTLEMENT_HOLD",
  "SETTLEMENT_RELEASE",
  "PAYOUT",
  "PAYOUT_REVERSAL",
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export interface LedgerEntryInput {
  sellerId: string;
  type: LedgerEntryType;
  /** Integer paisa, positive (ADJUSTMENT may be negative). */
  amountMinor: number;
  currency: "BDT";
  orderId?: string | null;
  /** External reference: batchId, payoutId, refundId, ticket… */
  reference?: string | null;
  /** Firebase uid or "system". */
  createdBy: string;
  /** Deterministic idempotency key (suffix of the doc id). */
  idempotencyKey?: string | null;
  createdAt?: number;
  /**
   * Additional writes committed ATOMICALLY with the ledger entry +
   * balance doc (e.g. the withdrawal request document that reserves
   * the funds). If the tx fails, these writes never land — no orphan
   * reservation documents can exist.
   */
  extraWrites?: FsWrite[];
}

export interface LedgerEntry extends Required<
  Omit<LedgerEntryInput, "orderId" | "reference" | "idempotencyKey" | "extraWrites">
> {
  /** Monotonic per-seller sequence — the authoritative replay order
   *  (createdAt ties at ms resolution are otherwise ambiguous). */
  seq: number;
  transactionId: string;
  orderId: string | null;
  reference: string | null;
  /** Explicit financial direction — NEVER inferred from UI labels. */
  direction: "CREDIT" | "DEBIT";
  /** Ledger entries are COMPLETED at append time (atomic commit). */
  status: "COMPLETED";
  balanceBefore: number;
  balanceAfter: number;
  heldBefore: number;
  heldAfter: number;
  createdAt: number;
}

/** Wallet lifecycle status (Prompt: Wallet §16). */
export const WALLET_STATUSES = ["ACTIVE", "SUSPENDED", "LOCKED", "CLOSED"] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

/** Withdrawal-like entries are blocked unless the wallet is ACTIVE. */
const WITHDRAWAL_ENTRY_TYPES: readonly LedgerEntryType[] = ["SETTLEMENT_HOLD", "PAYOUT"];

/** Explicit direction per entry type — single source of truth. */
export function entryDirection(type: LedgerEntryType, amountMinor: number): "CREDIT" | "DEBIT" {
  switch (type) {
    case "ORDER_CREDIT":
    case "SETTLEMENT_RELEASE":
    case "PAYOUT_REVERSAL":
      return "CREDIT";
    case "ADJUSTMENT":
      return amountMinor >= 0 ? "CREDIT" : "DEBIT";
    default:
      return "DEBIT";
  }
}

interface Balances {
  availableMinor: number;
  heldMinor: number;
  paidOutMinor: number;
  /** Lifetime sale credits — order earnings + positive adjustments.
   *  NOT decreased by withdrawals (paidOutMinor tracks those). */
  totalEarnedMinor: number;
  currency: "BDT";
}

function zeroBalances(): Balances {
  return { availableMinor: 0, heldMinor: 0, paidOutMinor: 0, totalEarnedMinor: 0, currency: "BDT" };
}

function readBalances(raw: Record<string, unknown> | undefined): Balances {
  // raw comes from batchGetDocsWithTx which ALREADY decodes FsValue.
  if (!raw) return zeroBalances();
  const b = raw as Partial<Balances>;
  return {
    availableMinor: Number(b.availableMinor ?? 0),
    heldMinor: Number(b.heldMinor ?? 0),
    paidOutMinor: Number(b.paidOutMinor ?? 0),
    totalEarnedMinor: Number(b.totalEarnedMinor ?? 0),
    currency: "BDT",
  };
}

/** Wallet status defaults to ACTIVE for wallets created before the
 *  status field existed (backward compatible). */
function readWalletStatus(raw: Record<string, unknown> | undefined): WalletStatus {
  const s = String(raw?.["status"] ?? "ACTIVE");
  return (WALLET_STATUSES as readonly string[]).includes(s) ? (s as WalletStatus) : "ACTIVE";
}

const MAX_ATTEMPTS = 5;

/**
 * Append a ledger entry + update the seller's balance doc atomically.
 * Returns the persisted entry (or the EXISTING entry when a duplicate
 * idempotency key is replayed — never a double-post).
 */
export async function appendLedgerEntry(
  projectId: string,
  input: LedgerEntryInput,
): Promise<LedgerEntry> {
  if (!Number.isSafeInteger(input.amountMinor)) {
    throw new Error(`finance/ledger: unsafe amountMinor ${input.amountMinor}`);
  }
  if (input.amountMinor === 0) {
    throw new Error(`finance/ledger: zero-amount entries are invalid`);
  }
  // Only ADJUSTMENT may carry a negative amount; every typed entry
  // derives direction from its type and must be positive.
  if (input.type !== "ADJUSTMENT" && input.amountMinor < 0) {
    throw new Error(`finance/ledger: ${input.type} requires a positive amountMinor`);
  }
  if (input.currency !== "BDT") {
    throw new Error(`finance/ledger: unsupported currency ${input.currency}`);
  }
  const idSuffix = input.idempotencyKey ?? newDocId();
  const entryId = `led_${input.sellerId}_${idSuffix}`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let tx: string | null = null;
    try {
      tx = await beginTransaction(projectId);
      const financeName = docPath(projectId, [SELLER_FINANCE_COLLECTION, input.sellerId]);
      const entryName = docPath(projectId, [SELLER_LEDGER_COLLECTION, entryId]);
      const docs = await batchGetDocsWithTx(projectId, [financeName, entryName], tx);

      // ── IDEMPOTENCY: deterministic id already written? Return it.
      const existing = docs.get(entryName);
      if (existing?.exists) {
        await rollbackTransaction(projectId, tx);
        const data = existing.data as Record<string, unknown>;
        return {
          transactionId: entryId,
          seq: Number(data["seq"] ?? 0),
          sellerId: input.sellerId,
          type: data["type"] as LedgerEntryType,
          amountMinor: Number(data["amountMinor"]),
          currency: "BDT",
          orderId: (data["orderId"] as string) ?? null,
          reference: (data["reference"] as string) ?? null,
          createdBy: data["createdBy"] as string,
          direction:
            (data["direction"] as "CREDIT" | "DEBIT" | undefined) ??
            entryDirection(data["type"] as LedgerEntryType, Number(data["amountMinor"])),
          status: "COMPLETED",
          balanceBefore: Number(data["balanceBefore"]),
          balanceAfter: Number(data["balanceAfter"]),
          heldBefore: Number(data["heldBefore"]),
          heldAfter: Number(data["heldAfter"]),
          createdAt: Number(data["createdAt"]),
        };
      }

      // ── Compute balance movement (integer math only).
      const financeRaw = (docs.get(financeName)?.data as Record<string, unknown>) ?? undefined;
      const balances = readBalances(financeRaw);
      const walletStatus = readWalletStatus(financeRaw);
      // ── WALLET STATUS POLICY (§16): withdrawals (funds leaving the
      // available balance by seller/admin payout action) require an
      // ACTIVE wallet. Order flow entries always post so the ledger
      // stays consistent with order lifecycle events.
      if (WITHDRAWAL_ENTRY_TYPES.includes(input.type) && walletStatus !== "ACTIVE") {
        await rollbackTransaction(projectId, tx);
        throw new Error(
          `finance/wallet: wallet is ${walletStatus} — withdrawal operations are blocked ` +
            `(${input.type} on seller ${input.sellerId})`,
        );
      }
      if (input.type === "ADJUSTMENT" && input.amountMinor < 0 && walletStatus === "CLOSED") {
        await rollbackTransaction(projectId, tx);
        throw new Error(`finance/wallet: wallet is CLOSED — debits are blocked`);
      }
      const nextSeq = Number((financeRaw?.["entrySeq"] as number | undefined) ?? 0) + 1;
      const before: Balances = { ...balances };
      const amt = input.amountMinor;
      switch (input.type) {
        case "ORDER_CREDIT":
          balances.availableMinor += amt;
          break;
        case "COMMISSION_DEBIT":
        case "SHIPPING_DEBIT":
        case "REFUND_DEBIT":
          balances.availableMinor -= amt;
          break;
        case "SETTLEMENT_HOLD":
          balances.availableMinor -= amt;
          balances.heldMinor += amt;
          break;
        case "SETTLEMENT_RELEASE":
          balances.availableMinor += amt;
          balances.heldMinor -= amt;
          break;
        case "PAYOUT":
          balances.availableMinor -= amt;
          balances.paidOutMinor += amt;
          break;
        case "PAYOUT_REVERSAL":
          balances.availableMinor += amt;
          balances.paidOutMinor -= amt;
          break;
        case "ADJUSTMENT":
          balances.availableMinor += amt;
          break; // signed amount
        default:
          throw new Error(`finance/ledger: unknown entry type ${input.type}`);
      }
      // totalEarned: lifetime credits (sales + positive adjustments).
      if (input.type === "ORDER_CREDIT" || (input.type === "ADJUSTMENT" && amt > 0)) {
        balances.totalEarnedMinor += amt;
      }
      if (balances.availableMinor < 0 || balances.heldMinor < 0) {
        await rollbackTransaction(projectId, tx);
        throw new Error(
          `finance/ledger: invariant violated — available=${balances.availableMinor} held=${balances.heldMinor} ` +
            `for ${input.type} on seller ${input.sellerId}`,
        );
      }

      const createdAt = input.createdAt ?? Date.now();
      const entry: LedgerEntry = {
        transactionId: entryId,
        seq: nextSeq,
        sellerId: input.sellerId,
        type: input.type,
        amountMinor: amt,
        currency: "BDT",
        orderId: input.orderId ?? null,
        reference: input.reference ?? null,
        direction: entryDirection(input.type, amt),
        status: "COMPLETED",
        createdBy: input.createdBy,
        balanceBefore: before.availableMinor,
        balanceAfter: balances.availableMinor,
        heldBefore: before.heldMinor,
        heldAfter: balances.heldMinor,
        createdAt,
      };

      // ── Atomic writes: ledger append + balance doc.
      const writes: FsWrite[] = [
        {
          update: {
            name: entryName,
            fields: toFsFields({ ...entry }),
          },
        },
        {
          update: {
            name: financeName,
            fields: toFsFields({
              sellerId: input.sellerId,
              availableMinor: balances.availableMinor,
              heldMinor: balances.heldMinor,
              paidOutMinor: balances.paidOutMinor,
              totalEarnedMinor: balances.totalEarnedMinor,
              currency: "BDT",
              status: walletStatus,
              entrySeq: nextSeq,
              lastEntryAt: createdAt,
              lastEntryType: input.type,
              updatedAt: createdAt,
            }),
          },
        },
      ];
      // Caller-supplied companion writes (e.g. the withdrawal request
      // doc) commit in the SAME transaction — all-or-nothing.
      if (input.extraWrites?.length) writes.push(...input.extraWrites);
      const committed = await commitWithTx(projectId, writes, tx);
      if (committed) return entry;
      lastError = new Error("finance/ledger: transaction conflict, retrying");
    } catch (err) {
      if (tx) await rollbackTransaction(projectId, tx).catch(() => {});
      throw err; // non-retryable business errors (invariant, currency…)
    }
  }
  throw lastError ?? new Error("finance/ledger: append failed after retries");
}

/**
 * Convenience: append several entries for one seller sequentially.
 * Each entry is its own atomic transaction; the group is NOT one big
 * transaction (a failed middle entry leaves a valid partial state —
 * the caller resumes with the deterministic idempotency keys).
 */
export async function appendLedgerEntries(
  projectId: string,
  inputs: LedgerEntryInput[],
): Promise<LedgerEntry[]> {
  const results: LedgerEntry[] = [];
  for (const input of inputs) {
    results.push(await appendLedgerEntry(projectId, input));
  }
  return results;
}

/** Read a seller's current balances (derived from the ledger chain). */
export async function getSellerBalances(projectId: string, sellerId: string): Promise<Balances> {
  const docs = await batchGetDocs(projectId, [
    docPath(projectId, [SELLER_FINANCE_COLLECTION, sellerId]),
  ]);
  const doc = docs.get(docPath(projectId, [SELLER_FINANCE_COLLECTION, sellerId]));
  if (!doc?.exists) return zeroBalances();
  return readBalances(doc.data as Record<string, unknown>);
}

/**
 * LEDGER INTEGRITY (§12): replay every entry for a seller and verify
 * the chain matches the stored balance doc. Returns the replayed
 * balances + a mismatch report. Used by reconciliation and tests.
 */
export async function verifyLedgerIntegrity(
  projectId: string,
  sellerId: string,
  entries: LedgerEntry[],
): Promise<{ ok: boolean; replayed: Balances; stored: Balances; mismatches: string[] }> {
  // Replay order: per-seller seq is authoritative; fall back to
  // (createdAt, id) only for legacy entries without seq.
  const sorted = [...entries].sort((a, b) => {
    const sa = (a as { seq?: number }).seq ?? -1;
    const sb = (b as { seq?: number }).seq ?? -1;
    if (sa >= 0 && sb >= 0) return sa - sb;
    return a.createdAt - b.createdAt || a.transactionId.localeCompare(b.transactionId);
  });
  const replayed = zeroBalances();
  const mismatches: string[] = [];
  let expectedEarned = 0;
  let expectedBefore = 0;
  let expectedHeldBefore = 0;
  for (const e of sorted) {
    if (e.balanceBefore !== expectedBefore || e.heldBefore !== expectedHeldBefore) {
      mismatches.push(
        `chain break at ${e.transactionId}: stored before ` +
          `(${e.balanceBefore}/${e.heldBefore}) != replayed (${expectedBefore}/${expectedHeldBefore})`,
      );
    }
    switch (e.type) {
      case "ORDER_CREDIT":
        replayed.availableMinor += e.amountMinor;
        replayed.totalEarnedMinor += e.amountMinor;
        break;
      case "COMMISSION_DEBIT":
      case "SHIPPING_DEBIT":
      case "REFUND_DEBIT":
        replayed.availableMinor -= e.amountMinor;
        break;
      case "SETTLEMENT_HOLD":
        replayed.availableMinor -= e.amountMinor;
        replayed.heldMinor += e.amountMinor;
        break;
      case "SETTLEMENT_RELEASE":
        replayed.availableMinor += e.amountMinor;
        replayed.heldMinor -= e.amountMinor;
        break;
      case "PAYOUT":
        replayed.availableMinor -= e.amountMinor;
        replayed.paidOutMinor += e.amountMinor;
        break;
      case "PAYOUT_REVERSAL":
        replayed.availableMinor += e.amountMinor;
        replayed.paidOutMinor -= e.amountMinor;
        break;
      case "ADJUSTMENT":
        replayed.availableMinor += e.amountMinor;
        if (e.amountMinor > 0) replayed.totalEarnedMinor += e.amountMinor;
        break;
    }
    expectedBefore = replayed.availableMinor;
    expectedHeldBefore = replayed.heldMinor;
    expectedEarned = replayed.totalEarnedMinor;
  }
  const stored = await getSellerBalances(projectId, sellerId);
  if (stored.availableMinor !== replayed.availableMinor) {
    mismatches.push(
      `available mismatch: stored=${stored.availableMinor} replayed=${replayed.availableMinor}`,
    );
  }
  if (stored.heldMinor !== replayed.heldMinor) {
    mismatches.push(`held mismatch: stored=${stored.heldMinor} replayed=${replayed.heldMinor}`);
  }
  if (stored.paidOutMinor !== replayed.paidOutMinor) {
    mismatches.push(
      `paidOut mismatch: stored=${stored.paidOutMinor} replayed=${replayed.paidOutMinor}`,
    );
  }
  if (
    (stored as Balances & { totalEarnedMinor?: number }).totalEarnedMinor !== undefined &&
    (stored as Balances & { totalEarnedMinor?: number }).totalEarnedMinor !== expectedEarned
  ) {
    mismatches.push(
      `totalEarned mismatch: stored=${(stored as Balances & { totalEarnedMinor?: number }).totalEarnedMinor} replayed=${expectedEarned}`,
    );
  }
  return { ok: mismatches.length === 0, replayed, stored, mismatches };
}
