import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";

export interface GiftCard {
  id: string;
  code: string;
  amount: number;
  balance: number;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
  status: "active" | "redeemed" | "expired";
  expiresAt: number;
  createdAt: number;
}

export interface GiftCardPurchase {
  amount: number;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
  theme: string;
}

export async function purchaseGiftCard(
  uid: string,
  data: GiftCardPurchase,
): Promise<string> {
  const db = getDb();
  const code = `NXA-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  await addDoc(collection(db, "giftCards"), {
    ...data,
    code,
    balance: data.amount,
    status: "active",
    uid,
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return code;
}

export async function listUserGiftCards(uid: string): Promise<GiftCard[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, "giftCards"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      code: String(data.code ?? ""),
      amount: Number(data.amount ?? 0),
      balance: Number(data.balance ?? 0),
      senderName: String(data.senderName ?? ""),
      senderEmail: String(data.senderEmail ?? ""),
      recipientName: String(data.recipientName ?? ""),
      recipientEmail: String(data.recipientEmail ?? ""),
      message: String(data.message ?? ""),
      status: (data.status as GiftCard["status"]) ?? "active",
      expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : 0,
      createdAt:
        typeof data.createdAt === "number"
          ? data.createdAt
          : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
    };
  });
}

export async function redeemGiftCard(
  uid: string,
  code: string,
): Promise<number> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "giftCards"), where("code", "==", code)),
  );
  if (snap.empty) throw new Error("Gift card not found");
  const cardDoc = snap.docs[0];
  const data = cardDoc.data() as Record<string, unknown>;
  const balance = Number(data.balance ?? 0);
  if (balance <= 0) throw new Error("Gift card has no balance");
  if (data.status !== "active") throw new Error("Gift card is not active");
  await updateDoc(doc(db, "giftCards", cardDoc.id), {
    balance: 0,
    status: "redeemed",
    redeemedBy: uid,
    redeemedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return balance;
}
