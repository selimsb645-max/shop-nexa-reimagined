/**
 * Server-side AI Assistant provider abstraction.
 *
 * This module implements a provider factory pattern (same as email.server.ts)
 * so the AI backend can be configured via environment variables without
 * touching UI or function code.
 *
 * SECURITY:
 *   - API keys are read from Deno.env and NEVER sent to the client.
 *   - All provider errors are sanitized before returning to the user.
 *   - Rate limiting is enforced per-user via Firestore.
 *   - Input is validated and size-limited.
 *   - Timeouts prevent hanging requests.
 *
 * Providers:
 *   - "openai"   → OpenAI Chat Completions API (or any OpenAI-compatible API)
 *   - "mock"     → Deterministic responses for testing/fallback (default)
 *
 * Env vars (all server-side only, never exposed to client):
 *   AI_PROVIDER            → "openai" | "mock" (default: "mock")
 *   AI_API_KEY             → Provider API key (never exposed to client)
 *   AI_API_BASE_URL        → Optional custom base URL
 *   AI_MODEL               → Model name (default: "gpt-4o-mini")
 *   AI_SYSTEM_PROMPT       → Optional custom system prompt
 *   AI_MAX_TOKENS          → Max response tokens (default: 500)
 *   AI_TEMPERATURE         → Response creativity (default: 0.7)
 *   AI_TIMEOUT_MS          → Request timeout (default: 15000)
 *   AI_RATE_LIMIT_PER_HOUR → Max requests per user per hour (default: 20)
 *   AI_MAX_HISTORY         → Max conversation turns sent to provider (default: 10)
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIResponse {
  reply: string;
  /** Whether the response came from a real AI provider or a fallback */
  source: "ai" | "fallback";
}

export interface AIProvider {
  name: string;
  /** Send messages to the AI and get a response. Throws on failure. */
  chat(messages: ChatMessage[], systemPrompt: string): Promise<string>;
}

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

function env(key: string): string | undefined {
  if (typeof Deno !== "undefined") return Deno.env.get(key);
  return undefined;
}

function envInt(key: string, def: number): number {
  const v = env(key);
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function envFloat(key: string, def: number): number {
  const v = env(key);
  if (!v) return def;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

export interface AIConfig {
  provider: string;
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  rateLimitPerHour: number;
  maxHistory: number;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are the ShopNexa AI Shopping Assistant. You help customers with product searches, " +
  "order tracking, coupons, returns, flash sales, and general shopping questions. " +
  "Be concise, friendly, and helpful. Keep responses under 200 words. " +
  "If you don't know something specific about the user's orders or account, " +
  "direct them to the appropriate section in the app.";

function getConfig(): AIConfig {
  return {
    provider: env("AI_PROVIDER") ?? "mock",
    apiKey: env("AI_API_KEY"),
    baseUrl: env("AI_API_BASE_URL") ?? "https://api.openai.com/v1",
    model: env("AI_MODEL") ?? "gpt-4o-mini",
    systemPrompt: env("AI_SYSTEM_PROMPT") ?? DEFAULT_SYSTEM_PROMPT,
    maxTokens: envInt("AI_MAX_TOKENS", 500),
    temperature: envFloat("AI_TEMPERATURE", 0.7),
    timeoutMs: envInt("AI_TIMEOUT_MS", 15000),
    rateLimitPerHour: envInt("AI_RATE_LIMIT_PER_HOUR", 20),
    maxHistory: envInt("AI_MAX_HISTORY", 10),
  };
}

// ═══════════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════════

/** OpenAI-compatible provider (works with OpenAI, Azure OpenAI, etc.) */
export class OpenAIProvider implements AIProvider {
  name = "openai";

  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
    private maxTokens: number,
    private temperature: number,
    private timeoutMs: number,
  ) {}

  async chat(messages: ChatMessage[], systemPrompt: string): Promise<string> {
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("AI service authentication failed.");
        }
        if (res.status === 429) {
          throw new Error("AI service is busy. Please try again in a moment.");
        }
        if (res.status >= 500) {
          throw new Error("AI service is temporarily unavailable.");
        }
        throw new Error("AI request failed.");
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content || !content.trim()) {
        throw new Error("AI returned an empty response.");
      }
      return content.trim();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("AI request timed out. Please try again.");
      }
      if (err instanceof Error && err.message.startsWith("AI ")) {
        throw err;
      }
      throw new Error("Could not reach AI service. Please try again.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Mock provider — deterministic responses for testing and fallback */
export class MockAIProvider implements AIProvider {
  name = "mock";

  async chat(messages: ChatMessage[], _systemPrompt: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 100));

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) {
      return "I'm here to help! What would you like to know?";
    }

    const q = lastUserMsg.content.toLowerCase();
    if (q.includes("track") || q.includes("order")) {
      return "To track your order, go to the Orders tab and tap on any order to see real-time tracking updates. You can also visit the Track Orders page for live delivery tracking.";
    }
    if (q.includes("coupon") || q.includes("discount")) {
      return "You can find all available coupons on the Coupons page. We frequently offer flash sale discounts and promo codes. Check back often for new deals!";
    }
    if (q.includes("flash") || q.includes("sale")) {
      return "Flash sales are live on the Flash Sales page! These are limited-time deals with significant discounts. Act fast before they end!";
    }
    if (q.includes("return") || q.includes("refund")) {
      return "You can request a return from the Returns & Refunds page. We accept returns within 7 days of delivery for eligible products.";
    }
    if (q.includes("product") || q.includes("find") || q.includes("search")) {
      return "You can browse all products on the Shop page. Use the search bar at the top to find specific items, or filter by category to discover new products.";
    }
    return "I'm here to help! You can ask me about orders, products, coupons, returns, flash sales, and more. What would you like to know?";
  }
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY
// ═══════════════════════════════════════════════════════════════

let _provider: AIProvider | null = null;
let _providerName = "";

function getProvider(): AIProvider {
  const config = getConfig();

  if (_provider && _providerName === config.provider) return _provider;

  switch (config.provider) {
    case "openai":
      if (!config.apiKey) {
        _provider = new MockAIProvider();
      } else {
        _provider = new OpenAIProvider(
          config.apiKey,
          config.baseUrl,
          config.model,
          config.maxTokens,
          config.temperature,
          config.timeoutMs,
        );
      }
      break;
    case "mock":
    default:
      _provider = new MockAIProvider();
      break;
  }

  _providerName = config.provider;
  return _provider;
}

/** Reset provider cache — used in tests */
export function _resetProviderCache(): void {
  _provider = null;
  _providerName = "";
}

// ═══════════════════════════════════════════════════════════════
// RATE LIMITING (Firestore-based, same pattern as verification.server.ts)
// ═══════════════════════════════════════════════════════════════

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkAIRateLimit(
  uid: string,
): Promise<RateLimitResult> {
  const config = getConfig();
  if (env("FIRESTORE_EMULATOR_HOST") || env("SKIP_RATE_LIMIT")) {
    return { allowed: true, remaining: config.rateLimitPerHour };
  }

  try {
    const { getProjectId, getAccessToken } = await import("./firebase-admin.server");
    const projectId = getProjectId();
    const since = Date.now() - 60 * 60 * 1000;

    // Use Firestore REST API runQuery (same pattern as verification.server.ts)
    const fsBase = env("FIRESTORE_EMULATOR_HOST")
      ? `${env("FIRESTORE_EMULATOR_HOST")}/v1/projects/${projectId}`
      : `https://firestore.googleapis.com/v1/projects/${projectId}`;

    const parentPath = `users/${uid}`;
    const res = await fetch(`${fsBase}/databases/(default)/documents/${parentPath}/aiRequests:runQuery`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await getAccessToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "aiRequests" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "createdAt" },
              op: "GREATER_THAN",
              value: { timestampValue: new Date(since).toISOString() },
            },
          },
          limit: config.rateLimitPerHour + 1,
        },
      }),
    });

    if (!res.ok) {
      // If query fails, fail open (allow request)
      return { allowed: true, remaining: config.rateLimitPerHour };
    }

    const rows = (await res.json()) as unknown[];
    const count = rows.length;
    return {
      allowed: count < config.rateLimitPerHour,
      remaining: Math.max(0, config.rateLimitPerHour - count),
    };
  } catch {
    // Fail open — don't block users if rate limiting infrastructure fails
    return { allowed: true, remaining: config.rateLimitPerHour };
  }
}

export async function recordAIRequest(
  uid: string,
): Promise<void> {
  if (env("FIRESTORE_EMULATOR_HOST") || env("SKIP_RATE_LIMIT")) return;

  try {
    const { getProjectId, commitWrites, newDocId, docPath } =
      await import("./firebase-admin.server");
    const projectId = getProjectId();
    const msgId = newDocId();

    await commitWrites(projectId, [
      {
        update: {
          name: docPath(projectId, ["users", uid, "aiRequests", msgId]),
          fields: {
            createdAt: { timestampValue: new Date().toISOString() },
            provider: { stringValue: getConfig().provider },
          },
        },
      },
    ]);
  } catch {
    // Fire-and-forget
  }
}

// ═══════════════════════════════════════════════════════════════
// INPUT VALIDATION
// ═══════════════════════════════════════════════════════════════

export const AI_INPUT_MAX_LENGTH = 1000;
export const AI_HISTORY_MAX_TURNS = 20;

export function validateAIInput(
  message: string,
  history: ChatMessage[],
): { valid: boolean; error?: string } {
  if (!message || !message.trim()) {
    return { valid: false, error: "Message cannot be empty." };
  }
  if (message.length > AI_INPUT_MAX_LENGTH) {
    return { valid: false, error: `Message must be under ${AI_INPUT_MAX_LENGTH} characters.` };
  }
  if (history.length > AI_HISTORY_MAX_TURNS) {
    return { valid: false, error: "Conversation history is too long." };
  }
  for (const msg of history) {
    if (!msg.content || msg.content.length > AI_INPUT_MAX_LENGTH) {
      return { valid: false, error: "Invalid conversation history." };
    }
    if (msg.role !== "user" && msg.role !== "assistant") {
      return { valid: false, error: "Invalid conversation history." };
    }
  }
  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

const FALLBACK_MESSAGE =
  "I'm having trouble connecting right now. Please try again in a moment, " +
  "or browse the Orders, Shop, and Coupons sections while I recover.";

export async function chatWithAI(
  uid: string,
  message: string,
  history: ChatMessage[],
): Promise<AIResponse> {
  const config = getConfig();

  // 1. Validate input
  const validation = validateAIInput(message, history);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 2. Rate limit check
  const rateCheck = await checkAIRateLimit(uid);
  if (!rateCheck.allowed) {
    throw new Error("You've sent too many messages. Please try again in an hour.");
  }

  // 3. Truncate history
  const trimmedHistory = history.slice(-config.maxHistory);

  // 4. Build messages
  const messages: ChatMessage[] = [
    ...trimmedHistory,
    { role: "user", content: message },
  ];

  // 5. Call provider
  const provider = getProvider();

  try {
    const reply = await provider.chat(messages, config.systemPrompt);
    void recordAIRequest(uid);
    return { reply, source: provider.name === "mock" ? "fallback" : "ai" };
  } catch (err) {
    // 6. Graceful fallback
    if (provider.name !== "mock") {
      try {
        const mock = new MockAIProvider();
        const reply = await mock.chat(messages, config.systemPrompt);
        return { reply, source: "fallback" };
      } catch {
        // fall through to static fallback
      }
    }

    return { reply: FALLBACK_MESSAGE, source: "fallback" };
  }
}

export { getConfig, getProvider };
