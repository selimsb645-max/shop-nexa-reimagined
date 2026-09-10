import {
  commitWrites,
  docPath,
  getAccessToken,
  getProjectId,
  newDocId,
  toFsFields,
  fromFsFields,
  beginTransaction,
  batchGetDocsWithTx,
  commitWithTx,
  rollbackTransaction,
  type FsValue,
  type FsWrite,
  type FetchedDoc,
} from "./firebase-admin.server";
import type { WithdrawalMethod } from "@/types/seller";
import {
  LEGACY_RESOLUTION_FROZEN,
  LEGACY_WITHDRAWALS_FROZEN,
  legacyWithdrawalsFrozenError,
} from "./finance/rail-mode.server";

export const MIN_WITHDRAWAL_AMOUNT = 10;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface WithdrawRequest {
  uid: string;
  amount: number;
  method: WithdrawalMethod;
  destination: string;
}

interface WithdrawResult {
  withdrawalId: string;
  amount: number;
  method: WithdrawalMethod;
  remainingBalance: number;
}

// ═══════════════════════════════════════════════════════════════
// TRANSACTION-SAFE WITHDRAWAL (concurrency protection)
// ═══════════════════════════════════════════════════════════════
// Mirrors the checkout wallet-deduction transaction pattern.
// Uses a Firestore transaction with the seller document as a
// concurrency lock to prevent double-spending via concurrent
// withdrawal requests.

const MAX_WITHDRAWAL_TX_RETRIES = 5;

/**
 * List walletTx document IDs for a seller (outside transaction — names only).
 * Same pattern as listWalletTxDocIds in checkout.server.ts / giftcards.server.ts.
 */
async function listSellerWalletTxDocIds(projectId: string, uid: string): Promise<string[]> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/sellers/${encodeURIComponent(uid)}/walletTx:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "walletTx" }],
          select: { fields: [{ fieldPath: "__name__" }] },
          limit: 1000,
        },
      }),
    },
  );
  if (!res.ok) throw new Error("Could not read wallet data. Please try again.");
  const json = (await res.json()) as Array<{ document?: { name?: string } }>;
  return json.filter((r) => r.document?.name).map((r) => r.document!.name!);
}

/**
 * Calculate seller wallet balance from fetched walletTx documents.
 * Same logic as the non-transactional version: completed entries count
 * fully, pending debits reduce available balance.
 */
function calculateSellerBalanceFromDocs(docs: Map<string, FetchedDoc>): number {
  let balance = 0;
  for (const doc of docs.values()) {
    if (!doc.exists) continue;
    const amount = Number(doc.data.amount ?? 0);
    const status = String(doc.data.status ?? "completed");
    if (status === "completed") {
      balance += amount;
    } else if (status === "pending" && amount < 0) {
      balance += amount; // pending withdrawals reduce available
    }
  }
  return Math.round(balance * 100) / 100;
}

/**
 * Creates a withdrawal request server-side.
 *
 * TRANSACTION-SAFE: Uses a Firestore transaction with the seller document
 * as a concurrency lock — same pattern as checkout wallet deduction and
 * gift card purchases. Two concurrent withdrawal requests cannot both
 * pass the balance check; the second will abort and retry with fresh data.
 *
 * - Reads wallet balance within transaction (authoritative + locked)
 * - Creates withdrawal doc + pending walletTx entry within transaction
 * - Bumps seller walletTxVersion to release the lock
 */
export async function requestWithdrawalServer(req: WithdrawRequest): Promise<WithdrawResult> {
  // CANONICAL RAIL FREEZE (Sep 7 2026): this first-generation withdrawal
  // path predates settlement.server.ts and has no live callers. New seller
  // withdrawals run exclusively on the v2 wallet (requestWalletWithdrawal).
  if (LEGACY_WITHDRAWALS_FROZEN) throw legacyWithdrawalsFrozenError();
  const projectId = getProjectId();

  if (req.amount < MIN_WITHDRAWAL_AMOUNT) {
    throw new Error(`Minimum withdrawal amount is $${MIN_WITHDRAWAL_AMOUNT}.`);
  }

  const sellerDocName = docPath(projectId, ["sellers", req.uid]);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_WITHDRAWAL_TX_RETRIES; attempt++) {
    let tx: string | null = null;
    try {
      // 1. Begin transaction
      tx = await beginTransaction(projectId);

      // 2. List walletTx document IDs (outside tx — just for names)
      const walletTxNames = await listSellerWalletTxDocIds(projectId, req.uid);

      // 3. Read seller doc + all walletTx docs WITHIN the transaction
      const allNames = [sellerDocName, ...walletTxNames];
      const docs = await batchGetDocsWithTx(projectId, allNames, tx);

      // 4. Calculate balance from transaction-locked reads
      const sellerDoc = docs.get(sellerDocName);
      void sellerDoc; // read as lock — no field check needed
      const walletDocs = new Map(
        Array.from(docs.entries()).filter(([name]) => name !== sellerDocName),
      );
      const balance = calculateSellerBalanceFromDocs(walletDocs);

      // 5. Check balance — this is the CRITICAL concurrency-safe check
      if (req.amount > balance) {
        await rollbackTransaction(projectId, tx);
        throw new Error(`Insufficient balance. Available: $${balance.toFixed(2)}`);
      }

      // 6. Prepare atomic writes within the transaction
      const withdrawalId = newDocId();
      const txId = newDocId();
      const nowMs = Date.now();
      const now = new Date().toISOString();

      const writes: FsWrite[] = [
        // Withdrawal request document
        {
          update: {
            name: docPath(projectId, ["sellers", req.uid, "withdrawals", withdrawalId]),
            fields: toFsFields({
              sellerId: req.uid,
              amount: req.amount,
              method: req.method,
              destination: req.destination,
              status: "pending",
              requestedAt: nowMs,
              processedAt: null,
              note: null,
              txId: null,
            }),
          },
          currentDocument: { exists: false },
        },
        // Pending walletTx entry (debit)
        {
          update: {
            name: docPath(projectId, ["sellers", req.uid, "walletTx", txId]),
            fields: toFsFields({
              type: "withdrawal",
              amount: -req.amount,
              orderId: null,
              note: `Withdrawal #${withdrawalId.slice(0, 8)} via ${req.method}`,
              status: "pending",
              createdAt: nowMs,
            }),
          },
          currentDocument: { exists: false },
        },
        // Seller document update (the "lock release" — bumps walletTxVersion
        // so any concurrent transaction reading the same seller doc will abort)
        {
          update: {
            name: sellerDocName,
            fields: toFsFields({
              walletTxVersion: attempt + 1,
              updatedAt: now,
            }),
          },
          updateMask: { fieldPaths: ["walletTxVersion", "updatedAt"] },
        },
      ];

      // 7. Commit within the transaction
      const committed = await commitWithTx(projectId, writes, tx);
      if (committed) {
        return {
          withdrawalId,
          amount: req.amount,
          method: req.method,
          remainingBalance: round2(balance - req.amount),
        };
      }

      // 8. ABORTED — concurrent transaction modified our reads. Retry.
      lastError = new Error("Another transaction modified your wallet. Retrying...");
    } catch (err) {
      if (tx) await rollbackTransaction(projectId, tx);
      throw err; // Non-retryable error (e.g., insufficient balance)
    }
  }

  throw lastError ?? new Error("Withdrawal failed after multiple retries. Please try again.");
}

/**
 * Process a withdrawal (admin action).
 * - Marks withdrawal as completed/rejected
 * - Updates walletTx status
 * - If completed: creates a completed walletTx (the pending one stays as record)
 * - If rejected: creates a reversal walletTx
 */
export async function processWithdrawalServer(input: {
  adminUid: string;
  sellerId: string;
  withdrawalId: string;
  action: "approve" | "reject";
  note?: string;
}): Promise<{ status: string }> {
  // CANONICAL RAIL FREEZE (Sep 7 2026): dead-code path, kept only as
  // historical record. New withdrawals: v2 wallet. In-flight resolution:
  // settlement.server.processSettlementWithdrawal.
  if (LEGACY_WITHDRAWALS_FROZEN || LEGACY_RESOLUTION_FROZEN) {
    throw legacyWithdrawalsFrozenError();
  }
  const projectId = getProjectId();
  const token = await getAccessToken();

  // Read the withdrawal document
  const withdrawRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/sellers/${encodeURIComponent(input.sellerId)}/withdrawals/${input.withdrawalId}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  if (!withdrawRes.ok) {
    throw new Error("Withdrawal request not found.");
  }

  const withdrawDoc = await withdrawRes.json();
  const withdrawData = fromFsFields(withdrawDoc.fields ?? {});
  const amount = Number(withdrawData.amount ?? 0);
  const method = String(withdrawData.method ?? "bank");
  const currentStatus = String(withdrawData.status ?? "pending");

  if (currentStatus !== "pending") {
    throw new Error(`Withdrawal already ${currentStatus}.`);
  }

  const nowMs = Date.now();
  const txId = newDocId();

  const writes: FsWrite[] = [
    // Update withdrawal status
    {
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, "withdrawals", input.withdrawalId]),
        fields: toFsFields({
          status: input.action === "approve" ? "completed" : "rejected",
          processedAt: nowMs,
          note: input.note ?? null,
          txId: input.action === "approve" ? txId : null,
        }),
      },
      updateMask: {
        fieldPaths: ["status", "processedAt", "note", "txId"],
      },
    },
  ];

  if (input.action === "approve") {
    // Create a completed walletTx (the pending one stays for audit)
    writes.push({
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, "walletTx", txId]),
        fields: toFsFields({
          type: "withdrawal",
          amount: -amount,
          orderId: null,
          note: `Withdrawal completed #${input.withdrawalId.slice(0, 8)}`,
          status: "completed",
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });
  } else {
    // Reversal: create a positive walletTx to offset the pending debit
    writes.push({
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, "walletTx", txId]),
        fields: toFsFields({
          type: "adjustment",
          amount: amount,
          orderId: null,
          note: `Withdrawal rejected #${input.withdrawalId.slice(0, 8)}, funds reversed`,
          status: "completed",
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });
  }

  // Create admin notification
  writes.push({
    update: {
      name: docPath(projectId, ["sellers", input.sellerId, "notifications", newDocId()]),
      fields: toFsFields({
        type: "withdrawal",
        title: input.action === "approve" ? "Withdrawal approved" : "Withdrawal rejected",
        message:
          input.action === "approve"
            ? `Your withdrawal of $${amount.toFixed(2)} via ${method} has been processed.`
            : `Your withdrawal of $${amount.toFixed(2)} was rejected. ${input.note ?? ""}`,
        link: "/seller/withdrawals",
        read: false,
        createdAt: nowMs,
      }),
    },
  });

  await commitWrites(projectId, writes);

  return {
    status: input.action === "approve" ? "completed" : "rejected",
  };
}
