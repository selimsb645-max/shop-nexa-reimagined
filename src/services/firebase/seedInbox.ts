import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDb } from "./config";

const WELCOME_SUBJECT = "Welcome to AVENTA SHOP!";
const WELCOME_PARTICIPANT = "AVENTA SHOP Support";
const WELCOME_MESSAGE =
  "Hi! Welcome to AVENTA SHOP. We're here to help with anything you need. Feel free to ask questions about orders, products, or your account.";

function toMillis(value: unknown): number {
  if (typeof value === "number") return value;
  const withToMillis = value as { toMillis?: () => number } | undefined;
  return withToMillis?.toMillis?.() ?? 0;
}

/**
 * Seeds a new user's inbox with demo data so they don't see an empty state.
 *
 * Race-safe: uses deterministic doc IDs + a Firestore transaction so that
 * concurrent calls (e.g. effect re-mounts, multiple tabs) can never create
 * more than one welcome thread. Also self-heals any duplicate welcome
 * threads left over from before this fix by collapsing them into one.
 *
 * NOTE: This function no longer creates fake reward/promo notifications.
 * Those are now created server-side by
 * rewards.server.ts with real backing data (rewardTx + promoCodes).
 * This function also self-heals (deletes) old cosmetic notification
 * documents left over from the previous implementation.
 */
export async function seedInbox(uid: string): Promise<void> {
  const db = getDb();
  const threadsCol = collection(db, "users", uid, "threads");

  // Self-heal: collapse any duplicate welcome threads created by the old
  // race-prone implementation into a single thread, keeping the oldest.
  const dupSnap = await getDocs(
    query(
      threadsCol,
      where("participant", "==", WELCOME_PARTICIPANT),
      where("subject", "==", WELCOME_SUBJECT),
    ),
  );
  if (dupSnap.size > 1) {
    const sorted = [...dupSnap.docs].sort(
      (a, b) => toMillis(a.data().createdAt) - toMillis(b.data().createdAt),
    );
    const [, ...duplicates] = sorted;
    await Promise.all(duplicates.map((d) => deleteDoc(d.ref)));
  }

  // Self-heal: delete old cosmetic reward notification ("reward-notif")
  // These were fake — no real rewardTx backed them. The real reward notification
  // is now created server-side with doc ID "welcome-reward-notif".
  const oldRewardNotifRef = doc(collection(db, "users", uid, "notifications"), "reward-notif");
  const oldRewardSnap = await getDocs(
    query(
      collection(db, "users", uid, "notifications"),
      where("__name__", "==", "reward-notif"),
      limit(1),
    ),
  );
  // Firestore doesn't support __name__ in client SDK queries — use direct doc read
  void oldRewardSnap;
  try {
    const oldNotifSnap = await getDocs(
      query(collection(db, "users", uid, "notifications"), limit(100)),
    );
    for (const d of oldNotifSnap.docs) {
      if (d.id === "reward-notif" || d.id === "promo-notif") {
        await deleteDoc(d.ref);
      }
    }
  } catch {
    // Best-effort cleanup — old orphans don't block seeding
  }
  void oldRewardNotifRef;

  // If the user already has any thread (welcome or real), they're already seeded.
  const anyThreadSnap = await getDocs(query(threadsCol, limit(1)));
  if (!anyThreadSnap.empty) return;

  const threadRef = doc(threadsCol, "welcome-thread");
  const msgRef = doc(collection(db, "users", uid, "messages"), "welcome-msg");
  const notifRef = doc(collection(db, "users", uid, "notifications"), "welcome-notif");

  // Atomic + race-safe: only the transaction that observes the doc missing
  // will create it. Any concurrent call retries and finds it already exists.
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(threadRef);
    if (existing.exists()) return;

    tx.set(threadRef, {
      subject: WELCOME_SUBJECT,
      participant: WELCOME_PARTICIPANT,
      sellerId: null,
      lastMessage: WELCOME_MESSAGE,
      lastAt: serverTimestamp(),
      unread: 1,
      createdAt: serverTimestamp(),
    });

    tx.set(msgRef, {
      threadId: threadRef.id,
      body: WELCOME_MESSAGE,
      from: "support",
      createdAt: serverTimestamp(),
    });

    tx.set(notifRef, {
      type: "system",
      title: "Welcome to AVENTA SHOP! 🎉",
      message: "Your account is ready. Start exploring thousands of products from local sellers.",
      link: null,
      read: false,
      createdAt: serverTimestamp(),
    });

    // NOTE: Fake reward and promo notifications are no longer
    // created here. They are created server-side by rewards.server.ts
    // with real backing data (rewardTx + actual AVENTA###### promo code).
  });
}
