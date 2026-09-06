/**
 * AVENTA SHOP — Finance Permissions (Prompt 04 §11)
 *
 * Finance-specific permissions:
 *   finance.read        — view ledger, settlements, batches, payouts
 *   finance.review      — review a generated settlement batch
 *   finance.adjust      — create correction (ADJUSTMENT) transactions
 *   finance.settlement  — generate + approve settlement batches
 *   finance.payout       — execute payouts (batch execution)
 *   finance.refund      — post refund/reversal entries
 *   finance.reconcile   — run reconciliation, mark batches reconciled
 *
 * HARD RULES:
 *  - Support admin and content admin have NO finance permission at all
 *    (not even finance.read) — enforced here AND in Firestore rules.
 *  - This map is the server-side source of truth. The admin UI only
 *    uses it to HIDE controls — every server function re-checks.
 *
 * Re-authentication requirement (Prompt 04 §6) for sensitive actions
 * (approve, execute, adjust, refund) is implemented in
 * settlementBatch.server.ts via requireFreshAuth().
 */

export const FINANCE_PERMISSIONS = [
  "finance.read",
  "finance.review",
  "finance.adjust",
  "finance.settlement",
  "finance.payout",
  "finance.refund",
  "finance.reconcile",
] as const;

export type FinancePermission = (typeof FINANCE_PERMISSIONS)[number];

/** Roles with full finance authority. */
const FULL_FINANCE_ROLES = ["super_admin", "finance_admin"] as const;

/** admin: operational read-only on finance. order_manager: read-only. */
const READ_ONLY_ROLES = ["admin", "order_manager"] as const;

export const FINANCE_ROLE_PERMISSIONS: Record<string, readonly FinancePermission[]> = {
  super_admin: FINANCE_PERMISSIONS, // all
  finance_admin: FINANCE_PERMISSIONS, // all
  admin: ["finance.read"],
  order_manager: ["finance.read"],
  // EVERYONE else — support_admin, content_admin, catalog_manager,
  // category_manager, qc_manager, marketing roles, sellers, customers —
  // has ZERO finance permissions. Not listed = not granted (deny-by-default).
};

/** Server-side permission check. NEVER rely on the client for this. */
export function hasFinancePermission(adminRole: string | null | undefined, permission: FinancePermission): boolean {
  if (!adminRole) return false;
  const granted = FINANCE_ROLE_PERMISSIONS[adminRole];
  if (!granted) return false; // deny-by-default
  return granted.includes(permission);
}

/** Roles allowed to READ finance documents (mirrored in Firestore rules). */
export const FINANCE_READ_ROLES: readonly string[] = [
  "super_admin", "finance_admin", "admin", "order_manager",
];

/** Can this role perform ANY financial mutation? (Used as a guard rail.) */
export function canMutateFinance(adminRole: string | null | undefined): boolean {
  return adminRole === "super_admin" || adminRole === "finance_admin";
}
