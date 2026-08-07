import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getDb, firebaseConfigured } from "./config";
import type { AdminRole, AdminPermission } from "@/types/user";
import { ROLE_PERMISSIONS } from "@/types/user";

const USERS = "users";

/**
 * Get the admin role for a user.
 * Returns null if the user is not an admin or doesn't have an adminRole set.
 */
export async function getAdminRole(uid: string): Promise<AdminRole | null> {
  if (!firebaseConfigured) return null;
  const snap = await getDoc(doc(getDb(), USERS, uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.role !== "admin") return null;
  return (data.adminRole as AdminRole) ?? null;
}

/**
 * Set a user's admin role. Only super_admin can do this.
 * Also sets the user's role to "admin" if it isn't already.
 */
export async function setAdminRole(
  uid: string,
  adminRole: AdminRole,
): Promise<void> {
  if (!firebaseConfigured) throw new Error("Firebase is not configured.");
  await updateDoc(doc(getDb(), USERS, uid), {
    role: "admin",
    adminRole,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Remove admin role from a user (revert to customer).
 */
export async function removeAdminRole(uid: string): Promise<void> {
  if (!firebaseConfigured) throw new Error("Firebase is not configured.");
  await updateDoc(doc(getDb(), USERS, uid), {
    role: "customer",
    adminRole: null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Check if a user has a specific admin permission.
 */
export async function checkPermission(
  uid: string,
  permission: AdminPermission,
): Promise<boolean> {
  const role = await getAdminRole(uid);
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Get all permissions for a user's admin role.
 */
export async function getUserPermissions(
  uid: string,
): Promise<AdminPermission[]> {
  const role = await getAdminRole(uid);
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Get all users with admin roles.
 */
export async function listAdminUsers(): Promise<
  Array<{
    uid: string;
    email: string | null;
    displayName: string | null;
    adminRole: AdminRole;
  }>
> {
  if (!firebaseConfigured) return [];
  const { getDocs, query, where, collection } = await import("firebase/firestore");
  const snap = await getDocs(
    query(collection(getDb(), USERS), where("role", "==", "admin")),
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: (data.email as string | null) ?? null,
      displayName: (data.displayName as string | null) ?? null,
      adminRole: (data.adminRole as AdminRole) ?? "admin",
    };
  });
}
