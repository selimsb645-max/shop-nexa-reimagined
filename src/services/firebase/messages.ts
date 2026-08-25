import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./config";
import { toMs } from "./timestamps";
import type { ChatMessage, MessageThread } from "@/types/customer";

function threadsCol(uid: string) {
  return collection(getDb(), "users", uid, "threads");
}
function messagesCol(uid: string) {
  return collection(getDb(), "users", uid, "messages");
}

function mapThread(id: string, d: Record<string, unknown>): MessageThread {
  return {
    id,
    subject: String(d.subject ?? "Conversation"),
    participant: String(d.participant ?? "AVENTA SHOP Support"),
    sellerId: (d.sellerId as string | null) ?? null,
    lastMessage: String(d.lastMessage ?? ""),
    lastAt: toMs(d.lastAt),
    unread: Number(d.unread ?? 0),
    createdAt: toMs(d.createdAt),
  };
}

function mapMessage(id: string, d: Record<string, unknown>): ChatMessage {
  return {
    id,
    threadId: String(d.threadId ?? ""),
    body: String(d.body ?? ""),
    from: d.from === "support" ? "support" : "customer",
    createdAt: toMs(d.createdAt),
  };
}

/**
 * Collapses conceptual duplicate threads (e.g. two "AVENTA SHOP Support"
 * welcome threads created by a past race condition, or repeated threads
 * with the same seller) into a single entry.
 *
 * Grouping key:
 *  - seller threads: `seller:${sellerId}` — a customer should only ever
 *    have ONE ongoing thread with a given seller.
 *  - general support threads: `support:${participant}` — a customer
 *    should only ever have ONE ongoing general support thread.
 *
 * This is defense-in-depth: it runs on every read so the UI is correct
 * even if stale duplicate documents still exist in Firestore (e.g. before
 * a self-heal/cleanup pass has run for a given user). Within a duplicate
 * group we keep the most recently active thread's identity/content, but
 * take the MAX unread count across the group (never sum) so the unread
 * badge reflects one conceptual conversation, not N duplicate copies.
 */
export function dedupeThreads(threads: MessageThread[]): MessageThread[] {
  const groups = new Map<string, MessageThread>();
  for (const t of threads) {
    const key = t.sellerId ? `seller:${t.sellerId}` : `support:${t.participant}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, t);
      continue;
    }
    const newer = t.lastAt >= existing.lastAt ? t : existing;
    const older = newer === t ? existing : t;
    groups.set(key, { ...newer, unread: Math.max(newer.unread, older.unread) });
  }
  return Array.from(groups.values()).sort((a, b) => b.lastAt - a.lastAt);
}

export async function listThreads(uid: string): Promise<MessageThread[]> {
  const snap = await getDocs(query(threadsCol(uid), orderBy("lastAt", "desc"), limit(50)));
  return dedupeThreads(snap.docs.map((d) => mapThread(d.id, d.data() as Record<string, unknown>)));
}

export async function listMessages(uid: string, threadId: string): Promise<ChatMessage[]> {
  const snap = await getDocs(
    query(messagesCol(uid), where("threadId", "==", threadId), orderBy("createdAt", "asc"), limit(300)),
  );
  return snap.docs.map((d) => mapMessage(d.id, d.data() as Record<string, unknown>));
}

export async function createThread(
  uid: string,
  input: { subject: string; participant?: string; sellerId?: string | null; firstMessage: string },
): Promise<string> {
  const ref = doc(threadsCol(uid));
  await setDoc(ref, {
    subject: input.subject,
    participant: input.participant ?? "AVENTA SHOP Support",
    sellerId: input.sellerId ?? null,
    lastMessage: input.firstMessage,
    lastAt: serverTimestamp(),
    unread: 0,
    createdAt: serverTimestamp(),
  });
  await sendMessage(uid, ref.id, input.firstMessage);
  return ref.id;
}

export async function sendMessage(uid: string, threadId: string, body: string): Promise<void> {
  const ref = doc(messagesCol(uid));
  await setDoc(ref, {
    threadId,
    body,
    from: "customer",
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(getDb(), "users", uid, "threads", threadId), {
    lastMessage: body,
    lastAt: serverTimestamp(),
  });
}

export async function markThreadRead(uid: string, threadId: string): Promise<void> {
  await updateDoc(doc(getDb(), "users", uid, "threads", threadId), { unread: 0 });
}

export async function countUnreadMessages(uid: string): Promise<number> {
  const snap = await getDocs(query(threadsCol(uid), where("unread", ">", 0), limit(50)));
  const threads = snap.docs.map((d) => mapThread(d.id, d.data() as Record<string, unknown>));
  // Dedupe first so two duplicate "AVENTA SHOP Support" threads (each unread=1)
  // count as ONE unread conversation, not two.
  return dedupeThreads(threads).reduce((s, t) => s + t.unread, 0);
}

export async function deleteThread(uid: string, threadId: string): Promise<void> {
  const msgs = await getDocs(query(messagesCol(uid), where("threadId", "==", threadId)));
  const batch = writeBatch(getDb());
  msgs.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(getDb(), "users", uid, "threads", threadId));
  await batch.commit();
}
