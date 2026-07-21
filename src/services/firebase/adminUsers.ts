import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import type { AppUserProfile, UserRole } from "@/types/user";

const USERS = "users";

export interface AdminUserRow extends AppUserProfile {
  blocked: boolean;
}

function mapUser(id: string, d: Record<string, unknown>): AdminUserRow {
  const created = d.createdAt as { toMillis?: () => number } | number | undefined;
  return {
    uid: id,
    email: (d.email as string | null) ?? null,
    displayName: (d.displayName as string | null) ?? null,
    photoURL: (d.photoURL as string | null) ?? null,
    role: (d.role as UserRole) ?? "customer",
    emailVerified: Boolean(d.emailVerified),
    blocked: Boolean(d.blocked),
    createdAt:
      typeof created === "number" ? created : created?.toMillis?.() ?? Date.now(),
    updatedAt: Date.now(),
  };
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const snap = await getDocs(query(collection(getDb(), USERS), orderBy("createdAt", "desc")));
  return snap.docs.map((s) => mapUser(s.id, s.data()));
}

export async function setUserBlocked(uid: string, blocked: boolean): Promise<void> {
  await updateDoc(doc(getDb(), USERS, uid), { blocked, updatedAt: serverTimestamp() });
}

export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  await updateDoc(doc(getDb(), USERS, uid), { role, updatedAt: serverTimestamp() });
}
