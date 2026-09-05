import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import { getFirebaseAuth } from "./config";
import { purchaseGiftCardFn } from "@/lib/giftcards.functions";

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

export interface GiftCardPurchaseInput {
  amount: number;
  recipientName: string;
  recipientEmail: string;
  message: string;
  theme: string;
}

export interface GiftCardPurchaseResult {
  code: string;
  giftCardId: string;
  amount: number;
}

/**
 * Purchases a gift card via the trusted server endpoint.
 *
 * The server verifies the user's Firebase ID token, reads the real wallet
 * balance, deducts the amount, and creates the gift card — all atomically.
 * The client never writes financial data directly to Firestore.
 */
export async function purchaseGiftCard(
  input: GiftCardPurchaseInput,
): Promise<GiftCardPurchaseResult> {
  const currentUser = getFirebaseAuth().currentUser;
  if (!currentUser) throw new Error("Please sign in to purchase a gift card.");
  const idToken = await currentUser.getIdToken();

  return purchaseGiftCardFn({
    data: {
      idToken,
      amount: input.amount,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
      message: input.message,
      theme: input.theme,
    },
  });
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
    redeemedAt: new Date(),
    updatedAt: new Date(),
  });
  return balance;
}
