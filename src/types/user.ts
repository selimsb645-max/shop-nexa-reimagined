export type UserRole = "customer" | "seller" | "admin";

/**
 * Admin sub-roles for multi-admin permission system.
 * Stored on the user document as `adminRole` when `role === "admin"`.
 */
export type AdminRole =
  | "super_admin" // Full access to everything
  | "admin" // General admin, no finance/super permissions
  | "finance_admin" // Withdrawals, earnings, commissions, payouts
  | "support_admin" // Orders, customer support, refunds
  | "content_admin"; // Products, categories, coupons, banners

/**
 * Granular permissions. Each admin role has a predefined set.
 * Super admin has ALL permissions. Other roles have subsets.
 */
export type AdminPermission =
  // Seller management
  | "sellers.view"
  | "sellers.approve"
  | "sellers.suspend"
  | "sellers.delete"
  // Product management
  | "products.view"
  | "products.edit"
  | "products.delete"
  | "products.approve"
  // Order management
  | "orders.view"
  | "orders.update"
  | "orders.cancel"
  // Finance
  | "finance.view"
  | "finance.commissions"
  | "finance.withdrawals.process"
  | "finance.payouts"
  // Coupons
  | "coupons.view"
  | "coupons.create"
  | "coupons.edit"
  | "coupons.delete"
  // Categories
  | "categories.view"
  | "categories.create"
  | "categories.edit"
  | "categories.delete"
  // Users
  | "users.view"
  | "users.edit"
  | "users.delete"
  // Analytics
  | "analytics.view"
  // System
  | "settings.view"
  | "settings.edit"
  | "admin.manage"; // Super admin only: manage other admins

/**
 * Role → permission mapping. Super admin gets every permission.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    "sellers.view",
    "sellers.approve",
    "sellers.suspend",
    "sellers.delete",
    "products.view",
    "products.edit",
    "products.delete",
    "products.approve",
    "orders.view",
    "orders.update",
    "orders.cancel",
    "finance.view",
    "finance.commissions",
    "finance.withdrawals.process",
    "finance.payouts",
    "coupons.view",
    "coupons.create",
    "coupons.edit",
    "coupons.delete",
    "categories.view",
    "categories.create",
    "categories.edit",
    "categories.delete",
    "users.view",
    "users.edit",
    "users.delete",
    "analytics.view",
    "settings.view",
    "settings.edit",
    "admin.manage",
  ],
  admin: [
    "sellers.view",
    "sellers.approve",
    "sellers.suspend",
    "products.view",
    "products.edit",
    "products.approve",
    "orders.view",
    "orders.update",
    "coupons.view",
    "coupons.create",
    "coupons.edit",
    "categories.view",
    "categories.create",
    "categories.edit",
    "users.view",
    "analytics.view",
    "settings.view",
  ],
  finance_admin: [
    "finance.view",
    "finance.commissions",
    "finance.withdrawals.process",
    "finance.payouts",
    "orders.view",
    "analytics.view",
    "sellers.view",
  ],
  support_admin: [
    "orders.view",
    "orders.update",
    "orders.cancel",
    "sellers.view",
    "products.view",
    "users.view",
  ],
  content_admin: [
    "products.view",
    "products.edit",
    "products.delete",
    "products.approve",
    "coupons.view",
    "coupons.create",
    "coupons.edit",
    "coupons.delete",
    "categories.view",
    "categories.create",
    "categories.edit",
    "categories.delete",
  ],
};

export interface AppUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  adminRole: AdminRole | null; // NEW: set when role === "admin"
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Check if a user profile has a specific admin permission.
 */
export function hasPermission(
  profile: AppUserProfile | null,
  permission: AdminPermission,
): boolean {
  if (!profile) return false;
  if (profile.role !== "admin") return false;
  if (!profile.adminRole) return false;
  const perms = ROLE_PERMISSIONS[profile.adminRole];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Check if a user profile has ANY of the given permissions.
 */
export function hasAnyPermission(
  profile: AppUserProfile | null,
  permissions: AdminPermission[],
): boolean {
  return permissions.some((p) => hasPermission(profile, p));
}
