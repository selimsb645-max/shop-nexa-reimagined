/**
 * AVENTA SHOP — centralized email role configuration.
 *
 * Single source of truth for the four department mailboxes. Safe to import
 * from both client (UI display) and server (From/Reply-To routing) code —
 * contains only public addresses, never credentials.
 *
 * Sending credentials (Gmail app passwords / provider API keys) live ONLY
 * in server-side environment variables — never in client code, Firestore,
 * or the repository.
 */

export interface EmailRoleConfig {
  /** Gmail address used as the From address for this role. */
  email: string;
  /** Display name shown in email clients. */
  displayName: string;
  /**
   * Customers are expected to reply to emails from this role.
   * When false, no Reply-To header is set (system/automated mail).
   */
  acceptsReplies: boolean;
}

export const EMAIL_ROLES = {
  /** Order lifecycle transactional email (placed → delivered, returns, refunds). */
  orders: {
    email: "orders.aventashop@gmail.com",
    displayName: "AVENTA SHOP Orders",
    acceptsReplies: true,
  },
  /** Customer support, contact us, help center, complaints, tickets. */
  support: {
    email: "help.aventashop@gmail.com",
    displayName: "AVENTA SHOP Support",
    acceptsReplies: true,
  },
  /** General / business / partnership / seller-onboarding inquiries. */
  info: {
    email: "info.aventashop@gmail.com",
    displayName: "AVENTA SHOP",
    acceptsReplies: true,
  },
  /** Automated system/account mail (OTP, verification, password reset). */
  noreply: {
    email: "noreply.aventashop@gmail.com",
    displayName: "AVENTA SHOP",
    acceptsReplies: false,
  },
} as const satisfies Record<string, EmailRoleConfig>;

export type EmailRole = keyof typeof EMAIL_ROLES;

export const SUPPORT_EMAIL = EMAIL_ROLES.support.email;
export const INFO_EMAIL = EMAIL_ROLES.info.email;
export const ORDERS_EMAIL = EMAIL_ROLES.orders.email;

/** Display "Display Name <address>" for a role. */
export function formatFromHeader(role: EmailRole): string {
  const r = EMAIL_ROLES[role];
  return `${r.displayName} <${r.email}>`;
}

/** Reply-To for a role — undefined for noreply (never force replies to noreply). */
export function replyToForRole(role: EmailRole): string | undefined {
  return EMAIL_ROLES[role].acceptsReplies ? EMAIL_ROLES[role].email : undefined;
}
