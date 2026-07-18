import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDb } from "./config";
import type { AppUserProfile, UserRole } from "@/types/user";

const USERS = "users";

export async function ensureUserProfile(user: User): Promise<AppUserProfile> {
  const db = getDb();
  const ref = doc(db, USERS, user.uid);
  const snap = await getDoc(ref);
  const now = Date.now();
  if (!snap.exists()) {
    const profile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: "customer" as UserRole,
      emailVerified: user.emailVerified,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(ref, { ...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return profile;
  }
  const data = snap.data();
  return {
    uid: user.uid,
    email: data.email ?? user.email,
    displayName: data.displayName ?? user.displayName,
    photoURL: data.photoURL ?? user.photoURL,
    role: (data.role as UserRole) ?? "customer",
    emailVerified: user.emailVerified,
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : data.createdAt?.toMillis?.() ?? now,
    updatedAt: now,
  };
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<AppUserProfile, "displayName" | "photoURL" | "emailVerified">>,
) {
  const db = getDb();
  await updateDoc(doc(db, USERS, uid), { ...patch, updatedAt: serverTimestamp() });
}
