/**
 * Transactional Email Service for Shop Nexa
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

export type { EmailEvent, EmailTemplateData } from "./email-templates.server";

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
  ): Promise<{ success: boolean; providerId?: string; error?: string }>;
}

/* Mock Provider (Development) */
class MockEmailProvider implements EmailProvider {
  name = "mock";
  async send(to: string, subject: string, html: string) {
    if (typeof console !== "undefined") {
      console.log(`\n[MOCK EMAIL] To: ${to}`);
      console.log(`[MOCK EMAIL] Subject: ${subject}`);
      console.log(`[MOCK EMAIL] HTML length: ${html.length} chars`);
    }
    return { success: true, providerId: `mock_${Date.now()}` };
  }
}

/* Resend Provider */
class ResendEmailProvider implements EmailProvider {
  name = "resend";
  async send(to: string, subject: string, html: string) {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("EMAIL_FROM") ?? "noreply@shopnexa.app";
    if (!apiKey) return { success: false, error: "RESEND_API_KEY not configured" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ from: `Shop Nexa <${fromEmail}>`, to, subject, html }),
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
  async send(to: string, subject: string, html: string) {
    const apiKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("EMAIL_FROM") ?? "noreply@shopnexa.app";
    if (!apiKey) return { success: false, error: "SENDGRID_API_KEY not configured" };
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail, name: "Shop Nexa" },
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

/* Provider Factory */
let _provider: EmailProvider | null = null;

function getEmailProvider(): EmailProvider {
  if (_provider) return _provider;
  const name = (typeof Deno !== "undefined" && Deno.env.get("EMAIL_PROVIDER")) ?? "mock";
  switch (name) {
    case "resend":
      _provider = new ResendEmailProvider();
      break;
    case "sendgrid":
      _provider = new SendGridEmailProvider();
      break;
    case "mock":
    default:
      _provider = new MockEmailProvider();
      break;
  }
  if (typeof console !== "undefined")
    console.log(`[EMAIL] Provider initialized: ${_provider.name}`);
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
  return (
    (typeof Deno !== "undefined" && Deno.env.get("FIREBASE_PROJECT_ID")) ||
    (typeof Deno !== "undefined" && Deno.env.get("GCLOUD_PROJECT")) ||
    "shop-nexa"
  );
}

function fsBaseUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

interface EmailLogEntry {
  emailId: string;
  event: string;
  idempotencyKey: string;
  recipient: string;
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
    const token =
      (typeof Deno !== "undefined" && Deno.env.get("FIREBASE_SERVICE_ACCOUNT_TOKEN")) || null;
    const fields: Record<string, { stringValue: string }> = {
      emailId: { stringValue: entry.emailId },
      event: { stringValue: entry.event },
      idempotencyKey: { stringValue: entry.idempotencyKey },
      recipient: { stringValue: entry.recipient },
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
    const token =
      (typeof Deno !== "undefined" && Deno.env.get("FIREBASE_SERVICE_ACCOUNT_TOKEN")) || null;
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
}

export async function sendTransactionalEmail(params: SendEmailParams): Promise<EmailResult> {
  const { event, recipient, data, entityId } = params;
  const idempotencyKey = makeIdempotencyKey(event, recipient, entityId);
  const emailId = `em_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();

  // In-memory duplicate check
  if (_sentKeys.has(idempotencyKey)) {
    if (typeof console !== "undefined")
      console.log(`[EMAIL] Duplicate suppressed (in-memory): ${idempotencyKey}`);
    return { delivered: true, provider: "cache", emailId, error: "duplicate_suppressed" };
  }

  // Firestore idempotency check
  const alreadySent = await checkIdempotency(idempotencyKey);
  if (alreadySent) {
    if (typeof console !== "undefined")
      console.log(`[EMAIL] Duplicate suppressed (firestore): ${idempotencyKey}`);
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

  // Send via provider
  const provider = getEmailProvider();
  const result = await provider.send(recipient, subject, html);

  // Log result
  const status = result.success ? "sent" : "failed";
  const sentAt = result.success ? new Date().toISOString() : undefined;
  await writeEmailLog({
    emailId,
    event,
    idempotencyKey,
    recipient,
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

  if (typeof console !== "undefined")
    console.log(`[EMAIL] ${event} \u2192 ${recipient}: ${status} (${provider.name})`);

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
