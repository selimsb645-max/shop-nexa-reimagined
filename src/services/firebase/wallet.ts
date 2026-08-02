import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import { toMs } from "./timestamps";
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
  const snap = await getDocs(query(walletCol(uid), orderBy("createdAt", "desc"), limit(100)));
  return snap.docs.map((d) => mapWallet(d.id, d.data() as Record<string, unknown>));
}

export async function getWalletBalance(uid: string): Promise<number> {
  const tx = await listWalletTx(uid);
  return Math.round(tx.reduce((s, t) => s + t.amount, 0) * 100) / 100;
}

export async function addWalletTx(
  uid: string,
  input: { type: WalletTxType; amount: number; note: string; orderId?: string | null },
): Promise<void> {
  await setDoc(doc(walletCol(uid)), {
    type: input.type,
    amount: Math.round(input.amount * 100) / 100,
    note: input.note,
    orderId: input.orderId ?? null,
    createdAt: serverTimestamp(),
  });
}

export async function listRewardTx(uid: string): Promise<RewardTx[]> {
  const snap = await getDocs(query(rewardCol(uid), orderBy("createdAt", "desc"), limit(100)));
  return snap.docs.map((d) => mapReward(d.id, d.data() as Record<string, unknown>));
}

export async function getRewardPoints(uid: string): Promise<number> {
  const tx = await listRewardTx(uid);
  return tx.reduce((s, t) => s + t.points, 0);
}

export async function addRewardTx(
  uid: string,
  input: { type: RewardTxType; points: number; note: string; orderId?: string | null },
): Promise<void> {
  await setDoc(doc(rewardCol(uid)), {
    type: input.type,
    points: Math.round(input.points),
    note: input.note,
    orderId: input.orderId ?? null,
    createdAt: serverTimestamp(),
  });
}

/** Redeem reward points into wallet credit. */
export async function redeemPoints(uid: string, points: number): Promise<number> {
  const available = await getRewardPoints(uid);
  if (points <= 0) throw new Error("Enter the points you want to redeem");
  if (points % POINTS_PER_CURRENCY_REDEEM !== 0)
    throw new Error(`Redeem in multiples of ${POINTS_PER_CURRENCY_REDEEM} points`);
  if (points > available) throw new Error("You do not have enough points");
  const credit = points / POINTS_PER_CURRENCY_REDEEM;
  await addRewardTx(uid, {
    type: "redeem",
    points: -points,
    note: `Redeemed ${points} points for wallet credit`,
  });
  await addWalletTx(uid, {
    type: "topup",
    amount: credit,
    note: `Reward redemption (${points} points)`,
  });
  return credit;
}

/** Credit cashback + loyalty points after a successful order. */
export async function creditOrderRewards(
  uid: string,
  orderId: string,
  orderTotal: number,
): Promise<void> {
  const cashback = Math.round(orderTotal * CASHBACK_RATE * 100) / 100;
  if (cashback > 0) {
    await addWalletTx(uid, {
      type: "cashback",
      amount: cashback,
      note: `Cashback for order #${orderId.slice(0, 8).toUpperCase()}`,
      orderId,
    });
  }
  const points = Math.floor(orderTotal * POINTS_PER_CURRENCY);
  if (points > 0) {
    await addRewardTx(uid, {
      type: "earn",
      points,
      note: `Earned on order #${orderId.slice(0, 8).toUpperCase()}`,
      orderId,
    });
  }
}
