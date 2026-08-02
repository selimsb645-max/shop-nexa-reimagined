import {
  collection,
  deleteDoc,
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
import type { CustomerNotification, NotificationType } from "@/types/customer";

function col(uid: string) {
  return collection(getDb(), "users", uid, "notifications");
}

function map(id: string, data: Record<string, unknown>): CustomerNotification {
  return {
    id,
    type: (data.type as NotificationType) ?? "system",
    title: String(data.title ?? ""),
    message: String(data.message ?? ""),
    link: (data.link as string | null) ?? null,
    read: Boolean(data.read),
    createdAt: toMs(data.createdAt),
  };
}

export async function listNotifications(uid: string, max = 60): Promise<CustomerNotification[]> {
  const snap = await getDocs(query(col(uid), orderBy("createdAt", "desc"), limit(max)));
  return snap.docs.map((d) => map(d.id, d.data() as Record<string, unknown>));
}

export async function countUnreadNotifications(uid: string): Promise<number> {
  const snap = await getDocs(query(col(uid), where("read", "==", false), limit(100)));
  return snap.size;
}

export async function pushNotification(
  uid: string,
  input: {
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
  },
): Promise<void> {
  const ref = doc(col(uid));
  await setDoc(ref, {
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationRead(uid: string, id: string): Promise<void> {
  await updateDoc(doc(getDb(), "users", uid, "notifications", id), { read: true });
}

export async function markAllNotificationsRead(uid: string): Promise<void> {
  const snap = await getDocs(query(col(uid), where("read", "==", false), limit(200)));
  if (snap.empty) return;
  const batch = writeBatch(getDb());
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}

export async function deleteNotification(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), "users", uid, "notifications", id));
}
