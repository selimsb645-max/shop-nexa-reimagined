import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";

/**
 * Seeds a new user's inbox with demo data so they don't see an empty state.
 * Only runs if no threads exist yet (idempotent).
 */
export async function seedInbox(uid: string): Promise<void> {
  // Check if already seeded
  const threadsSnap = await getDocs(
    query(collection(getDb(), "users", uid, "threads"), limit(1)),
  );
  if (!threadsSnap.empty) return;

  // 1. Create a welcome support thread
  const threadRef = doc(collection(getDb(), "users", uid, "threads"));
  await setDoc(threadRef, {
    subject: "Welcome to ShopNexa!",
    participant: "Shop Nexa Support",
    sellerId: null,
    lastMessage: "Hi! Welcome to ShopNexa. We're here to help with anything you need. Feel free to ask questions about orders, products, or your account.",
    lastAt: serverTimestamp(),
    unread: 1,
    createdAt: serverTimestamp(),
  });

  // Add the welcome message from support
  const msgRef = doc(collection(getDb(), "users", uid, "messages"));
  await setDoc(msgRef, {
    threadId: threadRef.id,
    body: "Hi! Welcome to ShopNexa. We're here to help with anything you need. Feel free to ask questions about orders, products, or your account.",
    from: "support",
    createdAt: serverTimestamp(),
  });

  // 2. Create a welcome notification
  const notifRef = doc(collection(getDb(), "users", uid, "notifications"));
  await setDoc(notifRef, {
    type: "system",
    title: "Welcome to ShopNexa! 🎉",
    message: "Your account is ready. Start exploring thousands of products from local sellers.",
    link: null,
    read: false,
    createdAt: serverTimestamp(),
  });

  // 3. Create a promo notification
  const promoRef = doc(collection(getDb(), "users", uid, "notifications"));
  await setDoc(promoRef, {
    type: "promo",
    title: "First Order Discount",
    message: "Use code WELCOME10 for 10% off your first order!",
    link: "/flash-sales",
    read: false,
    createdAt: serverTimestamp(),
  });

  // 4. Create a reward notification
  const rewardRef = doc(collection(getDb(), "users", uid, "notifications"));
  await setDoc(rewardRef, {
    type: "reward",
    title: "100 Bonus Points",
    message: "You've earned 100 bonus points for signing up. Use them on your first purchase!",
    link: "/rewards",
    read: false,
    createdAt: serverTimestamp(),
  });
}
