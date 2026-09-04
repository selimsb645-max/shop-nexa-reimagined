import {
  commitWrites,
  docPath,
  getAccessToken,
  getProjectId,
  newDocId,
  toFsFields,
  fromFsFields,
  type FsValue,
  type FsWrite,
} from "./firebase-admin.server";
import type { WithdrawalMethod } from "@/types/seller";

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

/**
 * Creates a withdrawal request server-side.
 * - Reads wallet balance from Firestore (authoritative)
 * - Creates withdrawal doc + pending walletTx entry
 * - All in a single atomic batch
 */
export async function requestWithdrawalServer(req: WithdrawRequest): Promise<WithdrawResult> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  if (req.amount < MIN_WITHDRAWAL_AMOUNT) {
    throw new Error(`Minimum withdrawal amount is $${MIN_WITHDRAWAL_AMOUNT}.`);
  }

  // Read wallet balance from Firestore ledger
  const walletRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(req.uid)}/walletTx:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: { from: [{ collectionId: "walletTx" }], limit: 1000 },
      }),
    },
  );

  if (!walletRes.ok) {
    throw new Error("Could not read wallet balance. Please try again.");
  }

  const walletJson = (await walletRes.json()) as Array<{
    document?: { fields?: Record<string, FsValue> };
  }>;

  let balance = 0;
  for (const row of walletJson) {
    if (!row.document) continue;
    const fields = fromFsFields(row.document.fields ?? {});
    const amount = Number(fields.amount ?? 0);
    const status = String(fields.status ?? "completed");
    if (status === "completed") {
      balance += amount;
    } else if (status === "pending" && amount < 0) {
      balance += amount; // pending withdrawals reduce available
    }
  }

  if (req.amount > balance) {
    throw new Error(`Insufficient balance. Available: $${balance.toFixed(2)}`);
  }

  const withdrawalId = newDocId();
  const txId = newDocId();
  const nowMs = Date.now();

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
  ];

  await commitWrites(projectId, writes);

  return {
    withdrawalId,
    amount: req.amount,
    method: req.method,
    remainingBalance: round2(balance - req.amount),
  };
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
