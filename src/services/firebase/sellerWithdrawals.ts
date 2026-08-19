import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getDb, firebaseConfigured } from "./config";
import { getSellerWalletBalance } from "./sellerWallet";
import type {
  WithdrawalMethod,
  WithdrawalRequest,
  WithdrawalStatus,
} from "@/types/seller";

const SELLERS = "sellers";
const WITHDRAWALS = "withdrawals";
const WALLET_TX = "walletTx";

export const MIN_WITHDRAWAL_AMOUNT = 10;

function nowMs() {
  return Date.now();
}

function mapWithdrawal(id: string, d: Record<string, unknown>): WithdrawalRequest {
  const r = d as Partial<WithdrawalRequest> & Record<string, unknown>;
  return {
    id,
    sellerId: String(r.sellerId ?? ""),
    amount: Number(r.amount ?? 0),
    method: (r.method as WithdrawalMethod) ?? "bank",
    destination: String(r.destination ?? ""),
    status: (r.status as WithdrawalStatus) ?? "pending",
    requestedAt:
      typeof r.requestedAt === "number"
        ? r.requestedAt
        : ((r.requestedAt as unknown) as { toMillis?: () => number })?.toMillis?.() ?? nowMs(),
    processedAt:
      r.processedAt != null
        ? typeof r.processedAt === "number"
          ? r.processedAt
          : (r.processedAt as { toMillis?: () => number })?.toMillis?.() ?? null
        : null,
    note: (r.note as string | null) ?? null,
    txId: (r.txId as string | null) ?? null,
  };
}

/**
 * List all withdrawal requests for a seller.
 */
export async function listWithdrawals(
  sellerId: string,
  max = 100,
): Promise<WithdrawalRequest[]> {
  if (!firebaseConfigured) return [];
  const snap = await getDocs(
    query(
      collection(getDb(), SELLERS, sellerId, WITHDRAWALS),
      orderBy("requestedAt", "desc"),
    ),
  );
  return snap.docs.slice(0, max).map((d) => mapWithdrawal(d.id, d.data()));
}

/**
 * Get a single withdrawal request.
 */
export async function getWithdrawal(
  sellerId: string,
  id: string,
): Promise<WithdrawalRequest | null> {
  if (!firebaseConfigured) return null;
  const snap = await getDoc(doc(getDb(), SELLERS, sellerId, WITHDRAWALS, id));
  return snap.exists() ? mapWithdrawal(snap.id, snap.data()) : null;
}

/**
 * Create a new withdrawal request.
 * Verifies available balance before creating.
 * Also creates a pending walletTx entry (debit).
 */
export async function requestWithdrawal(
  sellerId: string,
  amount: number,
  method: WithdrawalMethod,
  destination: string,
): Promise<string> {
  if (!firebaseConfigured) throw new Error("Firebase is not configured.");
  if (amount < MIN_WITHDRAWAL_AMOUNT) {
    throw new Error(`Minimum withdrawal amount is $${MIN_WITHDRAWAL_AMOUNT}.`);
  }

  const balance = await getSellerWalletBalance(sellerId);
  if (amount > balance) {
    throw new Error(
      `Insufficient balance. Available: $${balance.toFixed(2)}`,
    );
  }

  // Create withdrawal request
  const ref = await addDoc(
    collection(getDb(), SELLERS, sellerId, WITHDRAWALS),
    {
      sellerId,
      amount,
      method,
      destination,
      status: "pending",
      requestedAt: serverTimestamp(),
      processedAt: null,
      note: null,
      txId: null,
    },
  );

  // Create pending walletTx (debit)
  await addDoc(collection(getDb(), SELLERS, sellerId, WALLET_TX), {
    type: "withdrawal",
    amount: -amount,
    orderId: null,
    note: `Withdrawal request #${ref.id.slice(0, 8)} via ${method}`,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  return ref.id;
}
