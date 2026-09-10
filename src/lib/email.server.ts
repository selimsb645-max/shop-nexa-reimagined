/**
 * Transactional Email Service for AVENTA SHOP
 *
 * Provider abstraction: Mock, Resend, SendGrid.
 * Centralized sendTransactionalEmail() — no direct provider calls from app code.
 * Idempotency via event key to prevent duplicate emails.
 * Email delivery log stored server-side (Firestore).
 * Email failure never breaks the main transaction.
 *
 * SECURITY: API keys server-side only. No secrets in client bundle.
 */

import {
  renderEmailTemplate,
  type EmailEvent,
  type EmailTemplateData,
} from "./email-templates.server";
import { EMAIL_ROLES, replyToForRole, type EmailRole } from "./email-config";

export type { EmailEvent, EmailTemplateData } from "./email-templates.server";
export { EMAIL_ROLES, type EmailRole } from "./email-config";

/* Runtime-agnostic env reader.
 * Deno.env in test polyfill / Deno deploy; process.env on Node (Nitro/Vercel
 * production). Previously this module ONLY read Deno.env — in real Node
 * production every read silently returned undefined and the provider always
 * resolved to "mock". Fixed as part of the email role routing work. */
function getEnv(name: string): string | undefined {
  if (typeof Deno !== "undefined" && typeof Deno.env?.get === "function") {
    const v = Deno.env.get(name);
    if (v !== undefined) return v;
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

/* ─── Role routing ────────────────────────────────────────────────
 * ORDER_*                → orders.aventashop@gmail.com (replies welcome)
 * PASSWORD_RESET         → noreply.aventashop@gmail.com (automated, no Reply-To)
 * WITHDRAWAL_* (seller)  → noreply (automated financial notification; the
 *                          template footer links to Support for questions)
 * support/info           → no automated events; pass `role` explicitly
 *                          (e.g. contact-form/ticket flows). */
const EVENT_ROLES: Record<EmailEvent, EmailRole> = {
  ORDER_CREATED: "orders",
  ORDER_CONFIRMED: "orders",
  ORDER_PROCESSING: "orders",
  ORDER_SHIPPED: "orders",
  OUT_FOR_DELIVERY: "orders",
  ORDER_DELIVERED: "orders",
  ORDER_CANCELLED: "orders",
  PASSWORD_RESET: "noreply",
  WITHDRAWAL_REQUESTED: "noreply",
  WITHDRAWAL_APPROVED: "noreply",
  WITHDRAWAL_REJECTED: "noreply",
  WITHDRAWAL_COMPLETED: "noreply",
};

/** Which department mailbox an event is sent from. */
export function emailRoleForEvent(event: EmailEvent): EmailRole {
  return EVENT_ROLES[event];
}

export interface EmailSender {
  role: EmailRole;
  from: string;
  displayName: string;
  replyTo?: string;
}

function senderForRole(role: EmailRole): EmailSender {
  const r = EMAIL_ROLES[role];
  return { role, from: r.email, displayName: r.displayName, replyTo: replyToForRole(role) };
}

export interface EmailResult {
  delivered: boolean;
  provider: string;
  emailId: string;
  error?: string;
}

export interface EmailProvider {
  name: string;
  send(
    to: string,
    subject: string,
    html: string,
    sender: EmailSender,
  ): Promise<{ success: boolean; providerId?: string; error?: string }>;
}

/* Mock Provider (Development) — records sends so tests can assert routing. */
export interface MockSendRecord {
  to: string;
  subject: string;
  sender: EmailSender;
}
const _mockSends: MockSendRecord[] = [];
export function _clearMockSends(): void {
  _mockSends.length = 0;
}
export function _getMockSends(): readonly MockSendRecord[] {
  return _mockSends;
}

class MockEmailProvider implements EmailProvider {
  name = "mock";
  async send(to: string, subject: string, _html: string, sender: EmailSender) {
    _mockSends.push({ to, subject, sender });
    if (import.meta.env?.DEV) console.log("[MOCK EMAIL] sent (dev only)");
    return { success: true, providerId: `mock_${Date.now()}` };
  }
}

/* Resend Provider */
class ResendEmailProvider implements EmailProvider {
  name = "resend";
  async send(to: string, subject: string, html: string, sender: EmailSender) {
    const apiKey = getEnv("RESEND_API_KEY");
    // EMAIL_FROM (optional) overrides the From address for custom-domain setups.
    const fromEmail = getEnv("EMAIL_FROM") ?? sender.from;
    if (!apiKey) return { success: false, error: "RESEND_API_KEY not configured" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: `${sender.displayName} <${fromEmail}>`,
          to,
          subject,
          html,
          ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, error: `Resend HTTP ${res.status}: ${text.slice(0, 100)}` };
      }
      const json = (await res.json()) as { id?: string };
      return { success: true, providerId: json.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}

/* SendGrid Provider */
class SendGridEmailProvider implements EmailProvider {
  name = "sendgrid";
  async send(to: string, subject: string, html: string, sender: EmailSender) {
    const apiKey = getEnv("SENDGRID_API_KEY");
    // EMAIL_FROM (optional) overrides the From address for custom-domain setups.
    const fromEmail = getEnv("EMAIL_FROM") ?? sender.from;
    if (!apiKey) return { success: false, error: "SENDGRID_API_KEY not configured" };
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: to }],
              ...(sender.replyTo ? { reply_to: [{ email: sender.replyTo }] } : {}),
            },
          ],
          from: { email: fromEmail, name: sender.displayName },
          subject,
          content: [{ type: "text/html", value: html }],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, error: `SendGrid HTTP ${res.status}: ${text.slice(0, 100)}` };
      }
      return { success: true, providerId: res.headers.get("x-message-id") ?? undefined };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}

/* Gmail SMTP Provider — sends from the four department Gmail accounts.

FREE infrastructure: each account needs a Google "App Password"
(2FA enabled) configured as a server-side env var:
  GMAIL_ORDERS_APP_PASSWORD, GMAIL_SUPPORT_APP_PASSWORD,
  GMAIL_INFO_APP_PASSWORD, GMAIL_NOREPLY_APP_PASSWORD
Credentials never reach the client bundle or the repository. */
type NodemailerTransport = {
  sendMail(opts: Record<string, unknown>): Promise<{ messageId?: string }>;
};

class GmailSmtpProvider implements EmailProvider {
  name = "gmail";
  private transports = new Map<EmailRole, NodemailerTransport>();

  private async getTransport(role: EmailRole, password: string): Promise<NodemailerTransport> {
    let t = this.transports.get(role);
    if (!t) {
      const mod = await import("nodemailer");
      const nodemailer =
        (mod as { default?: { createTransport: typeof mod.createTransport } }).default ?? mod;
      t = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: EMAIL_ROLES[role].email, pass: password },
      }) as NodemailerTransport;
      this.transports.set(role, t);
    }
    return t;
  }

  async send(to: string, subject: string, html: string, sender: EmailSender) {
    const envName = `GMAIL_${sender.role.toUpperCase()}_APP_PASSWORD`;
    const password = getEnv(envName);
    if (!password) {
      return { success: false, error: `${envName} not configured` };
    }
    try {
      const transport = await this.getTransport(sender.role, password);
      const info = await transport.sendMail({
        from: `${sender.displayName} <${sender.from}>`,
        to,
        subject,
        html,
        ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
      });
      return { success: true, providerId: info.messageId };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Gmail SMTP send failed",
      };
    }
  }
}

/* Provider Factory */
let _provider: EmailProvider | null = null;

function getEmailProvider(): EmailProvider {
  if (_provider) return _provider;
  const name = getEnv("EMAIL_PROVIDER") ?? "mock";
  const isProduction = getEnv("NODE_ENV") === "production";

  // PRODUCTION SAFETY: Never fall back to mock in production.
  // If the env var is missing or "mock" in production, fail loudly
  // instead of silently dropping all emails (order confirmations, shipping
  // notifications, etc.). Mirrors the guard in verification.server.ts.

  if (isProduction && (name === "mock" || !name)) {
    throw new Error(
      "Email provider is not configured for production. " +
        "Set EMAIL_PROVIDER to 'resend' or 'sendgrid' and configure the API key.",
    );
  }

  switch (name) {
    case "resend":
      _provider = new ResendEmailProvider();
      break;
    case "sendgrid":
      _provider = new SendGridEmailProvider();
      break;
    case "gmail":
      _provider = new GmailSmtpProvider();
      break;
    case "mock":
    default:
      _provider = new MockEmailProvider();
      break;
  }

  return _provider;
}

export function _resetEmailProvider(): void {
  _provider = null;
}

export function _clearSentKeys(): void {
  _sentKeys.clear();
}

/* Firestore helpers (email delivery log) */
function getProjectId(): string {
  return getEnv("FIREBASE_PROJECT_ID") || getEnv("GCLOUD_PROJECT") || "shop-nexa";
}

function fsBaseUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

interface EmailLogEntry {
  emailId: string;
  event: string;
  idempotencyKey: string;
  recipient: string;
  fromEmail: string;
  subject: string;
  status: "pending" | "sent" | "failed";
  provider: string;
  errorCode?: string;
  createdAt: string;
  sentAt?: string;
}

async function writeEmailLog(entry: EmailLogEntry): Promise<void> {
  try {
    const projectId = getProjectId();
    const url = `${fsBaseUrl(projectId)}/emailLogs`;
    const token = getEnv("FIREBASE_SERVICE_ACCOUNT_TOKEN") || null;
    const fields: Record<string, { stringValue: string }> = {
      emailId: { stringValue: entry.emailId },
      event: { stringValue: entry.event },
      idempotencyKey: { stringValue: entry.idempotencyKey },
      recipient: { stringValue: entry.recipient },
      fromEmail: { stringValue: entry.fromEmail },
      subject: { stringValue: entry.subject },
      status: { stringValue: entry.status },
      provider: { stringValue: entry.provider },
      createdAt: { stringValue: entry.createdAt },
    };
    if (entry.sentAt) fields.sentAt = { stringValue: entry.sentAt };
    if (entry.errorCode) fields.errorCode = { stringValue: entry.errorCode };
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ fields }),
    });
  } catch {
    /* best-effort */
  }
}

async function checkIdempotency(idempotencyKey: string): Promise<boolean> {
  try {
    const projectId = getProjectId();
    const token = getEnv("FIREBASE_SERVICE_ACCOUNT_TOKEN") || null;
    const url = `${fsBaseUrl(projectId)}:runQuery`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: "emailLogs" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "idempotencyKey" },
            op: "EQUAL",
            value: { stringValue: idempotencyKey },
          },
        },
        limit: 1,
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as Array<{
      document?: { fields: { status?: { stringValue: string } } };
    }>;
    return json.some((r) => r.document?.fields?.status?.stringValue === "sent");
  } catch {
    return false;
  }
}

/* Idempotency */
export function makeIdempotencyKey(
  event: EmailEvent,
  recipient: string,
  entityId?: string,
): string {
  const parts = [event, recipient];
  if (entityId) parts.push(entityId);
  return parts.join(":");
}

const _sentKeys = new Set<string>();

/* Public API */
export interface SendEmailParams {
  event: EmailEvent;
  recipient: string;
  data: EmailTemplateData;
  entityId?: string;
  /** Explicit department mailbox (support/info) — defaults to the event's route. */
  role?: EmailRole;
}

export async function sendTransactionalEmail(params: SendEmailParams): Promise<EmailResult> {
  const { event, recipient, data, entityId } = params;
  const idempotencyKey = makeIdempotencyKey(event, recipient, entityId);
  const emailId = `em_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();

  // In-memory duplicate check
  if (_sentKeys.has(idempotencyKey)) {
    return { delivered: true, provider: "cache", emailId, error: "duplicate_suppressed" };
  }

  // Firestore idempotency check
  const alreadySent = await checkIdempotency(idempotencyKey);
  if (alreadySent) {
    return { delivered: true, provider: "cache", emailId, error: "duplicate_suppressed" };
  }

  // Render template
  let subject: string;
  let html: string;
  try {
    const rendered = renderEmailTemplate(event, data);
    subject = rendered.subject;
    html = rendered.html;
  } catch (err) {
    console.error(`[EMAIL] Template rendering failed for ${event}:`, err);
    return { delivered: false, provider: "none", emailId, error: "template_error" };
  }

  // Route to the department mailbox (or an explicitly provided role)
  const role = params.role ?? emailRoleForEvent(event);
  const sender = senderForRole(role);

  // Send via provider — email failure must never break the main transaction
  let provider: EmailProvider;
  try {
    provider = getEmailProvider();
  } catch (err) {
    const error = err instanceof Error ? err.message : "provider_config_error";
    console.error(`[EMAIL] Provider unavailable for ${event}: ${error}`);
    await writeEmailLog({
      emailId,
      event,
      idempotencyKey,
      recipient,
      fromEmail: sender.from,
      subject,
      status: "failed",
      provider: "none",
      errorCode: error.slice(0, 200),
      createdAt,
    });
    return { delivered: false, provider: "none", emailId, error: error.slice(0, 200) };
  }
  let result: Awaited<ReturnType<EmailProvider["send"]>>;
  try {
    result = await provider.send(recipient, subject, html, sender);
  } catch (err) {
    result = {
      success: false,
      error: err instanceof Error ? err.message : "provider_send_threw",
    };
  }

  // Log result
  const status = result.success ? "sent" : "failed";
  const sentAt = result.success ? new Date().toISOString() : undefined;
  await writeEmailLog({
    emailId,
    event,
    idempotencyKey,
    recipient,
    fromEmail: sender.from,
    subject,
    status,
    provider: provider.name,
    errorCode: result.error,
    createdAt,
    sentAt,
  });

  if (result.success) {
    _sentKeys.add(idempotencyKey);
    setTimeout(() => _sentKeys.delete(idempotencyKey), 10 * 60 * 1000);
  }

  if (typeof console !== "undefined") {
    if (result.success) {
      if (import.meta.env?.DEV) console.log(`[EMAIL] Sent ${event} to ${recipient} (${emailId})`);
    } else {
      console.error(`[EMAIL] Failed to send ${event} to ${recipient}: ${result.error}`);
    }
  }

  return { delivered: result.success, provider: provider.name, emailId, error: result.error };
}

/* Convenience wrappers */
export async function sendOrderEmail(
  event: Extract<
    EmailEvent,
    | "ORDER_CREATED"
    | "ORDER_CONFIRMED"
    | "ORDER_PROCESSING"
    | "ORDER_SHIPPED"
    | "OUT_FOR_DELIVERY"
    | "ORDER_DELIVERED"
    | "ORDER_CANCELLED"
  >,
  recipient: string,
  orderData: import("./email-templates.server").OrderEmailData,
): Promise<EmailResult> {
  return sendTransactionalEmail({
    event,
    recipient,
    data: { order: orderData },
    entityId: orderData.orderId,
  });
}

export async function sendPasswordResetEmail(
  recipient: string,
  recipientName: string,
  resetLink: string,
): Promise<EmailResult> {
  return sendTransactionalEmail({
    event: "PASSWORD_RESET",
    recipient,
    data: { recipientName, resetLink },
  });
}

export async function sendWithdrawalEmail(
  event: Extract<
    EmailEvent,
    "WITHDRAWAL_REQUESTED" | "WITHDRAWAL_APPROVED" | "WITHDRAWAL_REJECTED" | "WITHDRAWAL_COMPLETED"
  >,
  recipient: string,
  withdrawalData: import("./email-templates.server").WithdrawalEmailData,
): Promise<EmailResult> {
  return sendTransactionalEmail({
    event,
    recipient,
    data: { withdrawal: withdrawalData },
    entityId: withdrawalData.withdrawalId,
  });
}
