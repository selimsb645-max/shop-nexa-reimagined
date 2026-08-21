/**
 * Secure Checkout Verification System for Shop Nexa
 *
 * Server-side OTP generation, hashing, session management,
 * rate limiting, and provider abstraction.
 *
 * SECURITY:
 * - OTP is never stored in plaintext — SHA-256 hash with salt
 * - OTP is single-use — invalidated after successful verification
 * - Sessions are bound to cart hash + order total
 * - Rate limited at multiple levels
 */

import {
  getProjectId,
  getAccessToken,
  toFsValue,
  toFsFields,
  fromFsFields,
  docPath,
  type FsValue,
  type FsWrite,
} from "./firebase-admin.server";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_RESENDS = 5;
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 10; // per user per hour
const DUPLICATE_ORDER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface VerificationSession {
  sessionId: string;
  userId: string;
  phoneNumber: string;
  phoneHash: string;
  cartHash: string;
  orderTotal: number;
  itemCount: number;
  deliveryLocation: string;
  otpHash: string | null;
  otpSalt: string | null;
  otpExpiresAt: number | null;
  attemptCount: number;
  resendCount: number;
  status: "pending" | "verified" | "expired" | "failed";
  createdAt: number;
  expiresAt: number;
  lastOtpSentAt: number | null;
  verifiedAt: number | null;
}

export interface RequestOtpResult {
  sessionId: string;
  expiresAt: number;
  resendAvailableAt: number;
  remainingResends: number;
  // Only returned in mock mode for dev/testing
  mockOtp?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  message: string;
  remainingAttempts: number;
  verified: boolean;
}

/* ------------------------------------------------------------------ */
/* Crypto helpers                                                     */
/* ------------------------------------------------------------------ */

/** Cryptographically secure 6-digit OTP */
function generateOtp(): string {
  const bytes = new Uint8Array(OTP_LENGTH);
  crypto.getRandomValues(bytes);
  let otp = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += String(bytes[i] % 10);
  }
  return otp;
}

/** Generate random salt */
function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash OTP with salt using SHA-256 */
async function hashOtp(otp: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${otp}:${salt}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate 20-char Firestore-style doc ID */
function newDocId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}

/* ------------------------------------------------------------------ */
/* Cart fingerprint                                                   */
/* ------------------------------------------------------------------ */

/** Hash cart items + address to detect tampering */
export async function computeCartFingerprint(
  items: Array<{ productId: string; quantity: number }>,
  orderTotal: number,
  deliveryAddress: string,
): Promise<string> {
  const sorted = [...items].sort((a, b) => a.productId.localeCompare(b.productId));
  const payload = JSON.stringify({ sorted, orderTotal, deliveryAddress });
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(payload));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mask phone number: 01******789 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  const prefix = digits.slice(0, 2);
  const suffix = digits.slice(-3);
  const masked = "*".repeat(Math.max(digits.length - 5, 4));
  return `${prefix}${masked}${suffix}`;
}

/* ------------------------------------------------------------------ */
/* Firestore helpers                                                  */
/* ------------------------------------------------------------------ */

function fsBaseUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function readDoc(projectId: string, path: string): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  const res = await fetch(`${fsBaseUrl(projectId)}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);
  const json = (await res.json()) as { fields?: Record<string, FsValue> };
  return json.fields ? fromFsFields(json.fields) : {};
}

async function writeDoc(
  projectId: string,
  path: string,
  data: Record<string, unknown>,
  exists: boolean,
): Promise<void> {
  const token = await getAccessToken();
  const body: Record<string, unknown> = {
    fields: toFsFields(data),
  };
  if (!exists) {
    body.currentDocument = { exists: false };
  }
  const res = await fetch(`${fsBaseUrl(projectId)}/${path}?`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore write failed (${res.status}): ${text}`);
  }
}

async function runQuery(
  projectId: string,
  collectionId: string,
  parentPath: string,
  filters: unknown,
  limit: number,
): Promise<Array<{ name: string; data: Record<string, unknown> }>> {
  const token = await getAccessToken();
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
    where: filters,
    limit,
  };
  const url = parentPath
    ? `${fsBaseUrl(projectId)}/${parentPath}:runQuery`
    : `${fsBaseUrl(projectId)}:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`Query failed (${res.status})`);
  const json = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, FsValue> };
  }>;
  const results: Array<{ name: string; data: Record<string, unknown> }> = [];
  for (const entry of json) {
    if (entry.document?.fields) {
      results.push({
        name: entry.document.name,
        data: fromFsFields(entry.document.fields),
      });
    }
  }
  return results;
}

async function commitWrites(projectId: string, writes: FsWrite[]): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${fsBaseUrl(projectId)}:commit`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) throw new Error(`Commit failed (${res.status})`);
}

/* ------------------------------------------------------------------ */
/* Verification Provider Abstraction                                   */
/* ------------------------------------------------------------------ */

export interface VerificationProvider {
  name: string;
  sendOtp(phone: string, otp: string): Promise<{ delivered: boolean; mock?: boolean }>;
}

/** Mock provider — logs OTP to console, returns it for dev/testing */
class MockVerificationProvider implements VerificationProvider {
  name = "mock";
  async sendOtp(phone: string, otp: string) {
    if (typeof console !== "undefined") {
      console.log(`[MOCK OTP] ${phone}: ${otp}`);
    }
    return { delivered: true, mock: true };
  }
}

/** SMS provider — placeholder for production SMS gateway */
class SmsVerificationProvider implements VerificationProvider {
  name = "sms";
  async sendOtp(phone: string, otp: string) {
    // In production, integrate with an SMS gateway (e.g. SSLCommerz SMS, Twilio)
    // Credentials must come from environment variables only
    const apiUrl = Deno.env.get("SMS_GATEWAY_URL");
    const apiKey = Deno.env.get("SMS_GATEWAY_API_KEY");
    if (!apiUrl || !apiKey) {
      throw new Error("SMS gateway not configured");
    }
    // Implementation depends on the chosen provider's API
    // This is a generic template:
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: phone,
        message: `Your Shop Nexa verification code is ${otp}. Valid for 5 minutes.`,
      }),
    });
    return { delivered: res.ok };
  }
}

/** WhatsApp provider — placeholder for WhatsApp Business API */
class WhatsAppVerificationProvider implements VerificationProvider {
  name = "whatsapp";
  async sendOtp(phone: string, otp: string) {
    const apiUrl = Deno.env.get("WHATSAPP_API_URL");
    const apiKey = Deno.env.get("WHATSAPP_API_KEY");
    if (!apiUrl || !apiKey) {
      throw new Error("WhatsApp gateway not configured");
    }
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: phone,
        template: "otp_verification",
        params: [otp],
      }),
    });
    return { delivered: res.ok };
  }
}

let _provider: VerificationProvider | null = null;

function getProvider(): VerificationProvider {
  if (_provider) return _provider;
  const providerName = Deno.env.get("VERIFICATION_PROVIDER") ?? "mock";
  switch (providerName) {
    case "sms":
      _provider = new SmsVerificationProvider();
      break;
    case "whatsapp":
      _provider = new WhatsAppVerificationProvider();
      break;
    case "mock":
    default:
      _provider = new MockVerificationProvider();
      break;
  }
  return _provider;
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                      */
/* ------------------------------------------------------------------ */

async function checkRateLimit(
  projectId: string,
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const since = Date.now() - RATE_LIMIT_WINDOW_MS;
  const results = await runQuery(
    projectId,
    "verificationSessions",
    `users/${userId}`,
    {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "createdAt" },
              op: "GREATER_THAN",
              value: { integerValue: String(since) },
            },
          },
        ],
      },
    },
    RATE_LIMIT_MAX_REQUESTS + 1,
  );
  const count = results.length;
  return {
    allowed: count < RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - count),
  };
}

/* ------------------------------------------------------------------ */
/* Duplicate order detection                                          */
/* ------------------------------------------------------------------ */

export async function detectDuplicateOrder(
  projectId: string,
  userId: string,
  phoneNumber: string,
  cartHash: string,
  orderTotal: number,
): Promise<{ suspicious: boolean; reason?: string }> {
  const since = Date.now() - DUPLICATE_ORDER_WINDOW_MS;
  const results = await runQuery(
    projectId,
    "orders",
    `users/${userId}`,
    {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "createdAt" },
              op: "GREATER_THAN",
              value: { integerValue: String(since) },
            },
          },
        ],
      },
    },
    10,
  );

  if (results.length === 0) return { suspicious: false };

  for (const r of results) {
    const existingHash = String(r.data.cartHash ?? "");
    const existingTotal = Number(r.data.total ?? 0);
    const existingPhone = String(
      (r.data.shippingAddress as Record<string, unknown> | undefined)?.phone ?? "",
    );
    // Same cart hash + same total within 5 minutes = likely duplicate
    if (existingHash === cartHash && existingTotal === orderTotal) {
      return {
        suspicious: true,
        reason: "An identical order was placed recently.",
      };
    }
    // Same phone + same total within 5 minutes = possible duplicate
    if (
      existingPhone === phoneNumber &&
      existingTotal === orderTotal &&
      Math.abs(existingTotal - orderTotal) < 0.01
    ) {
      return {
        suspicious: true,
        reason: "A similar order was placed with the same details recently.",
      };
    }
  }
  return { suspicious: false };
}

/* ------------------------------------------------------------------ */
/* Core API: Request OTP                                              */
/* ------------------------------------------------------------------ */

export async function requestOtp(params: {
  userId: string;
  phoneNumber: string;
  cartItems: Array<{ productId: string; quantity: number }>;
  orderTotal: number;
  itemCount: number;
  deliveryLocation: string;
}): Promise<RequestOtpResult> {
  const projectId = getProjectId();
  const { userId, phoneNumber, cartItems, orderTotal, itemCount, deliveryLocation } = params;

  // 1. Rate limit check
  const rateCheck = await checkRateLimit(projectId, userId);
  if (!rateCheck.allowed) {
    throw new Error("Too many verification requests. Please try again later.");
  }

  // 2. Validate phone (Bangladeshi format: 01XXXXXXXXX)
  const phoneDigits = phoneNumber.replace(/\D/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 14) {
    throw new Error("Invalid phone number.");
  }

  // 3. Compute cart fingerprint
  const cartHash = await computeCartFingerprint(cartItems, orderTotal, deliveryLocation);

  // 4. Check for existing active session
  const existing = await runQuery(
    projectId,
    "verificationSessions",
    `users/${userId}`,
    {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "status" },
              op: "EQUAL",
              value: { stringValue: "pending" },
            },
          },
        ],
      },
    },
    1,
  );

  let sessionId: string;
  let resendCount = 0;
  let lastSentAt = 0;

  if (existing.length > 0) {
    // Reuse existing session
    const existingData = existing[0].data;
    sessionId = existing[0].name.split("/").pop()!;
    resendCount = Number(existingData.resendCount ?? 0);
    lastSentAt = Number(existingData.lastOtpSentAt ?? 0);

    // Check resend cooldown
    if (lastSentAt > 0 && Date.now() - lastSentAt < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastSentAt)) / 1000);
      throw new Error(`Please wait ${waitSec}s before requesting a new code.`);
    }

    // Check max resends
    if (resendCount >= MAX_RESENDS) {
      throw new Error("Too many resend requests. Please try again later.");
    }

    // Check if cart changed
    const existingCartHash = String(existingData.cartHash ?? "");
    if (existingCartHash !== cartHash) {
      // Cart changed — invalidate old session, create new one
      await writeDoc(
        projectId,
        `users/${userId}/verificationSessions/${sessionId}`,
        {
          status: "expired",
          expiredReason: "cart_changed",
          updatedAt: Date.now(),
        },
        true,
      );
      sessionId = newDocId();
      resendCount = 0;
    }
  } else {
    sessionId = newDocId();
  }

  // 5. Generate OTP
  const otp = generateOtp();
  const salt = generateSalt();
  const otpHash = await hashOtp(otp, salt);
  const now = Date.now();
  const otpExpiresAt = now + OTP_TTL_MS;
  const sessionExpiresAt = now + SESSION_TTL_MS;

  // 6. Send OTP via provider
  const provider = getProvider();
  let sendResult: { delivered: boolean; mock?: boolean };
  try {
    sendResult = await provider.sendOtp(phoneDigits, otp);
  } catch {
    throw new Error("Could not send verification code. Please try again.");
  }
  if (!sendResult.delivered) {
    throw new Error("Could not send verification code. Please try again.");
  }

  // 7. Create/update verification session
  const sessionData: Record<string, unknown> = {
    sessionId,
    userId,
    phoneNumber: phoneDigits,
    phoneMasked: maskPhone(phoneDigits),
    cartHash,
    orderTotal,
    itemCount,
    deliveryLocation,
    otpHash,
    otpSalt: salt,
    otpExpiresAt,
    attemptCount: 0,
    resendCount: resendCount + 1,
    status: "pending",
    createdAt: now,
    expiresAt: sessionExpiresAt,
    lastOtpSentAt: now,
    verifiedAt: null,
    provider: provider.name,
  };

  await writeDoc(
    projectId,
    `users/${userId}/verificationSessions/${sessionId}`,
    sessionData,
    false,
  );

  const result: RequestOtpResult = {
    sessionId,
    expiresAt: sessionExpiresAt,
    resendAvailableAt: now + RESEND_COOLDOWN_MS,
    remainingResends: MAX_RESENDS - resendCount - 1,
  };

  // Only expose OTP in mock mode for development
  if (sendResult.mock) {
    result.mockOtp = otp;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Core API: Verify OTP                                               */
/* ------------------------------------------------------------------ */

export async function verifyOtp(params: {
  userId: string;
  sessionId: string;
  otp: string;
}): Promise<VerifyOtpResult> {
  const projectId = getProjectId();
  const { userId, sessionId, otp } = params;

  // 1. Read session
  const sessionData = await readDoc(projectId, `users/${userId}/verificationSessions/${sessionId}`);

  if (!sessionData) {
    return {
      success: false,
      message: "Verification session not found. Please request a new code.",
      remainingAttempts: 0,
      verified: false,
    };
  }

  const status = String(sessionData.status ?? "");
  const expiresAt = Number(sessionData.expiresAt ?? 0);
  const otpExpiresAt = Number(sessionData.otpExpiresAt ?? 0);
  const attemptCount = Number(sessionData.attemptCount ?? 0);
  const storedHash = String(sessionData.otpHash ?? "");
  const storedSalt = String(sessionData.otpSalt ?? "");

  // 2. Check session status
  if (status === "verified") {
    return {
      success: false,
      message: "This verification has already been completed.",
      remainingAttempts: 0,
      verified: true,
    };
  }
  if (status === "expired" || status === "failed") {
    return {
      success: false,
      message: "Your verification session has expired. Please restart verification.",
      remainingAttempts: 0,
      verified: false,
    };
  }

  // 3. Check session expiry
  if (Date.now() > expiresAt) {
    await writeDoc(
      projectId,
      `users/${userId}/verificationSessions/${sessionId}`,
      {
        status: "expired",
        expiredReason: "session_timeout",
        updatedAt: Date.now(),
      },
      true,
    );
    return {
      success: false,
      message: "Your verification session has expired. Please restart verification.",
      remainingAttempts: 0,
      verified: false,
    };
  }

  // 4. Check OTP expiry
  if (Date.now() > otpExpiresAt) {
    await writeDoc(
      projectId,
      `users/${userId}/verificationSessions/${sessionId}`,
      {
        status: "expired",
        expiredReason: "otp_timeout",
        updatedAt: Date.now(),
      },
      true,
    );
    return {
      success: false,
      message: "This verification code has expired. Please request a new code.",
      remainingAttempts: 0,
      verified: false,
    };
  }

  // 5. Check max attempts
  if (attemptCount >= MAX_ATTEMPTS) {
    await writeDoc(
      projectId,
      `users/${userId}/verificationSessions/${sessionId}`,
      {
        status: "failed",
        failedReason: "max_attempts",
        updatedAt: Date.now(),
      },
      true,
    );
    return {
      success: false,
      message: "Too many attempts. Please request a new verification code.",
      remainingAttempts: 0,
      verified: false,
    };
  }

  // 6. Verify OTP hash
  const inputHash = await hashOtp(otp.trim(), storedSalt);
  const newAttemptCount = attemptCount + 1;

  if (inputHash !== storedHash) {
    // Increment attempt count
    await writeDoc(
      projectId,
      `users/${userId}/verificationSessions/${sessionId}`,
      {
        attemptCount: newAttemptCount,
        updatedAt: Date.now(),
      },
      true,
    );

    const remaining = MAX_ATTEMPTS - newAttemptCount;
    if (remaining <= 0) {
      await writeDoc(
        projectId,
        `users/${userId}/verificationSessions/${sessionId}`,
        {
          status: "failed",
          failedReason: "max_attempts",
          updatedAt: Date.now(),
        },
        true,
      );
      return {
        success: false,
        message: "Too many attempts. Please request a new verification code.",
        remainingAttempts: 0,
        verified: false,
      };
    }
    return {
      success: false,
      message: "Incorrect verification code. Please try again.",
      remainingAttempts: remaining,
      verified: false,
    };
  }

  // 7. Success — mark verified, invalidate OTP (single-use)
  await writeDoc(
    projectId,
    `users/${userId}/verificationSessions/${sessionId}`,
    {
      status: "verified",
      verifiedAt: Date.now(),
      otpHash: null, // clear hash so OTP can't be reused
      otpSalt: null,
      otpExpiresAt: null,
      attemptCount: newAttemptCount,
      updatedAt: Date.now(),
    },
    true,
  );

  return {
    success: true,
    message: "Phone number verified successfully.",
    remainingAttempts: 0,
    verified: true,
  };
}

/* ------------------------------------------------------------------ */
/* Core API: Validate session (used at order creation time)          */
/* ------------------------------------------------------------------ */

export async function validateVerificationSession(params: {
  userId: string;
  sessionId: string;
  cartItems: Array<{ productId: string; quantity: number }>;
  orderTotal: number;
  deliveryLocation: string;
}): Promise<{ valid: boolean; reason?: string }> {
  const projectId = getProjectId();
  const { userId, sessionId, cartItems, orderTotal, deliveryLocation } = params;

  const sessionData = await readDoc(projectId, `users/${userId}/verificationSessions/${sessionId}`);

  if (!sessionData) {
    return { valid: false, reason: "Verification session not found." };
  }

  const status = String(sessionData.status ?? "");
  const expiresAt = Number(sessionData.expiresAt ?? 0);

  // Must be verified
  if (status !== "verified") {
    return { valid: false, reason: "Phone verification is required to place this order." };
  }

  // Must not be expired
  if (Date.now() > expiresAt) {
    return { valid: false, reason: "Your verification session has expired." };
  }

  // Cart must match (anti-tamper)
  const currentCartHash = await computeCartFingerprint(cartItems, orderTotal, deliveryLocation);
  const sessionCartHash = String(sessionData.cartHash ?? "");
  if (currentCartHash !== sessionCartHash) {
    return { valid: false, reason: "Your cart has changed. Please verify your order again." };
  }

  // Order total must match
  const sessionTotal = Number(sessionData.orderTotal ?? 0);
  if (Math.abs(sessionTotal - orderTotal) > 0.01) {
    return { valid: false, reason: "Order total mismatch. Please verify your order again." };
  }

  return { valid: true };
}

/** Invalidate session after order is created (prevent reuse) */
export async function consumeVerificationSession(
  userId: string,
  sessionId: string,
  orderId: string,
): Promise<void> {
  const projectId = getProjectId();
  await writeDoc(
    projectId,
    `users/${userId}/verificationSessions/${sessionId}`,
    {
      status: "consumed",
      consumedOrderId: orderId,
      updatedAt: Date.now(),
    },
    true,
  );
}
