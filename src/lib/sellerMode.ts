/**
 * Seller Mode "lock" persistence.
 *
 * Spec: once an approved seller enters the Seller Workspace, the site stays
 * locked into Seller Mode — even across a full browser close/reopen — until
 * the seller explicitly taps "Exit Seller Mode" inside the workspace. Only
 * that explicit action clears the flag and returns them to the Customer
 * Website. This is per-account (keyed by uid) so it never leaks across
 * different logins on a shared device/browser.
 */

const KEY_PREFIX = "aventa_seller_mode:";

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isSellerModeActive(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const ls = safeLocalStorage();
  if (!ls) return false;
  try {
    return ls.getItem(KEY_PREFIX + uid) === "1";
  } catch {
    return false;
  }
}

export function activateSellerMode(uid: string | null | undefined): void {
  if (!uid) return;
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY_PREFIX + uid, "1");
  } catch {
    /* storage unavailable — Seller Mode simply won't persist, non-fatal */
  }
}

export function deactivateSellerMode(uid: string | null | undefined): void {
  if (!uid) return;
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(KEY_PREFIX + uid);
  } catch {
    /* ignore */
  }
}
