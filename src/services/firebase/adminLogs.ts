import {
  addDoc,
  collection,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getDb } from "./config";
import type { ActivityAction, ActivityLog } from "@/types/admin";

const COL = "activityLogs";

export async function logActivity(
  actor: { uid: string; email: string | null },
  action: ActivityAction,
  target: string,
  details = "",
): Promise<void> {
  await addDoc(collection(getDb(), COL), {
    actorUid: actor.uid,
    actorEmail: actor.email ?? null,
    action,
    target,
    details,
    createdAt: serverTimestamp(),
  });
}

export async function listActivityLogs(max = 200): Promise<ActivityLog[]> {
  const snap = await getDocs(
    query(collection(getDb(), COL), orderBy("createdAt", "desc"), fbLimit(max)),
  );
  return snap.docs.map((d) => {
    const r = d.data() as Record<string, unknown>;
    const created = r.createdAt as { toMillis?: () => number } | number | undefined;
    return {
      id: d.id,
      actorUid: String(r.actorUid ?? ""),
      actorEmail: (r.actorEmail as string | null) ?? null,
      action: r.action as ActivityAction,
      target: String(r.target ?? ""),
      details: String(r.details ?? ""),
      createdAt: typeof created === "number" ? created : (created?.toMillis?.() ?? Date.now()),
    } satisfies ActivityLog;
  });
}
