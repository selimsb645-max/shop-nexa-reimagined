import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { getDb, getFirebaseAuth } from "./config";
import { toMs } from "./timestamps";
import { redeemRewardPoints } from "@/lib/wallet.functions";
import type { RewardTx, RewardTxType, WalletTx, WalletTxType } from "@/types/customer";

export const CASHBACK_RATE = 0.01; // 1% of order total credited to wallet
export const POINTS_PER_CURRENCY = 1; // 1 point per 1 currency unit spent
export const POINTS_PER_CURRENCY_REDEEM = 100; // 100 points = 1 currency unit


function walletCol(uid: string) {
  return collection(getDb(), "users", uid, "walletTx");
}
function rewardCol(uid: string) {
  return collection(getDb(), "users", uid, "rewardTx");
}

function mapWallet(id: string, d: Record<string, unknown>): WalletTx {
  return {
    id,
    type: (d.type as WalletTxType) ?? "adjustment",
    amount: Number(d.amount ?? 0),
    note: String(d.note ?? ""),
    orderId: (d.orderId as string | null) ?? null,
    createdAt: toMs(d.createdAt),
  };
}

function mapReward(id: string, d: Record<string, unknown>): RewardTx {
  return {
    id,
    type: (d.type as RewardTxType) ?? "earn",
    points: Number(d.points ?? 0),
    note: String(d.note ?? ""),
    orderId: (d.orderId as string | null) ?? null,
    createdAt: toMs(d.createdAt),
  };
}

export async function listWalletTx(uid: string): Promise<WalletTx[]> {
  const snap = await getDocs(query(walletCol(uid), orderBy("createdAt", "desc"), limit(500)));
  return snap.docs.map((d) => mapWallet(d.id, d.data() as Record<string, unknown>));
}

export async function getWalletBalance(uid: string): Promise<number> {
  // TODO: For high-volume users, consider storing a running balance field
  // on the user document (updated atomically by server functions) instead
  // of summing all transactions client-side.
  const tx = await listWalletTx(uid);
  return Math.round(tx.reduce((s, t) => s + t.amount, 0) * 100) / 100;
}

export async function listRewardTx(uid: string): Promise<RewardTx[]> {
  const snap = await getDocs(query(rewardCol(uid), orderBy("createdAt", "desc"), limit(500)));
  return snap.docs.map((d) => mapReward(d.id, d.data() as Record<string, unknown>));
}

export async function getRewardPoints(uid: string): Promise<number> {
  const tx = await listRewardTx(uid);
  return tx.reduce((s, t) => s + t.points, 0);
}

/**
 * Redeem reward points into wallet credit. The ledger is written by the trusted
 * server endpoint — clients cannot write wallet or reward entries directly.
 */
export async function redeemPoints(_uid: string, points: number): Promise<number> {
  const currentUser = getFirebaseAuth().currentUser;
  if (!currentUser) throw new Error("Please sign in again to redeem your points.");
  const idToken = await currentUser.getIdToken();
  const result = await redeemRewardPoints({ data: { idToken, points } });
  return result.credit;
}



