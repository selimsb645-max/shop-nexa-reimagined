/**
 * Server-side AI Assistant — Provider-Agnostic Architecture
 *
 * Supports three provider types, selected via AI_PROVIDER env var:
 *
 *   "local"  → Self-hosted/local inference (Ollama, llama.cpp, etc.)
 *   "openai" → OpenAI Chat Completions API (or any OpenAI-compatible cloud API)
 *   "mock"   → Deterministic responses (development/testing only)
 *
 * Provider priority (no silent fallback in production):
 *   - AI_PROVIDER selects the primary provider
 *   - AI_FALLBACK_PROVIDER selects what happens on failure
 *   - AI_FALLBACK_PROVIDER=none → user gets an error message, never fake AI
 *   - AI_FALLBACK_PROVIDER=mock → only for development, gets mock responses
 *   - Default: AI_FALLBACK_PROVIDER=none (safe — never silently fake it)
 *
 * SECURITY:
 *   - API keys read from Deno.env, NEVER sent to client
 *   - All provider errors sanitized before returning to user
 *   - Rate limiting enforced per-user via Firestore
 *   - Input validated and size-limited
 *   - Timeouts prevent hanging requests
 *   - Unknown provider = error (no silent fallback to mock)
 *
 * No vendor lock-in: adding a new provider = implement AIProvider + add
 * one case in the factory. UI and business logic never change.
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AISource = "ai" | "fallback" | "error";

export interface AIResponse {
  reply: string;
  /** Where the response came from */
  source: AISource;
}

export interface AIProvider {
  /** Unique provider identifier */
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
  /** Primary provider: "local" | "openai" | "mock" */
  provider: string;
  /** Fallback on failure: "none" | "mock" (default: "none") */
  fallbackProvider: string;
  // Local provider config
  localBaseUrl: string;
  localModel: string;
  // OpenAI provider config
  apiKey: string | undefined;
  apiBaseUrl: string;
  model: string;
  // Shared config
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  rateLimitPerHour: number;
  maxHistory: number;
}

/** Valid provider names */
export const VALID_PROVIDERS = ["local", "openai", "mock"] as const;
export const VALID_FALLBACKS = ["none", "mock"] as const;

const DEFAULT_SYSTEM_PROMPT =
  "You are the AVENTA SHOP AI Shopping Assistant. You help customers with product searches, " +
  "order tracking, coupons, returns, flash sales, and general shopping questions. " +
  "Be concise, friendly, and helpful. Keep responses under 200 words. " +
  "If you don't know something specific about the user's orders or account, " +
  "direct them to the appropriate section in the app.";

function getConfig(): AIConfig {
  return {
    provider: env("AI_PROVIDER") ?? "mock",
    fallbackProvider: env("AI_FALLBACK_PROVIDER") ?? "none",
    // Local provider
    localBaseUrl: env("AI_LOCAL_BASE_URL") ?? "http://localhost:11434/v1",
    localModel: env("AI_LOCAL_MODEL") ?? "",
    // OpenAI provider
    apiKey: env("AI_API_KEY"),
    apiBaseUrl: env("AI_API_BASE_URL") ?? "https://api.openai.com/v1",
    model: env("AI_MODEL") ?? "gpt-4o-mini",
    // Shared
    systemPrompt: env("AI_SYSTEM_PROMPT") ?? DEFAULT_SYSTEM_PROMPT,
    maxTokens: envInt("AI_MAX_TOKENS", 500),
    temperature: envFloat("AI_TEMPERATURE", 0.7),
    timeoutMs: envInt("AI_TIMEOUT_MS", 15000),
    rateLimitPerHour: envInt("AI_RATE_LIMIT_PER_HOUR", 20),
    maxHistory: envInt("AI_MAX_HISTORY", 10),
  };
}

// ═══════════════════════════════════════════════════════════════
// SHARED: OpenAI-compatible HTTP call
// ═══════════════════════════════════════════════════════════════

/**
 * Shared chat completion call for any OpenAI-compatible endpoint.
 * Used by both OpenAIProvider and LocalAIProvider.
 * Differentiates auth: OpenAI sends Bearer token, local may not need auth.
 */
async function openAICompatibleChat(
  messages: ChatMessage[],
  systemPrompt: string,
  baseUrl: string,
  model: string,
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
  apiKey: string | undefined,
): Promise<string> {
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    max_tokens: maxTokens,
    temperature,
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
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
      if (res.status === 404) {
        throw new Error("AI model not found. Check model configuration.");
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
    // Re-throw already-sanitized errors
    if (err instanceof Error && err.message.startsWith("AI ")) {
      throw err;
    }
    // Network errors (connection refused, DNS failure, etc.)
    throw new Error("Could not reach AI service. Please try again.");
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════════

/**
 * Local AI Provider — connects to any OpenAI-compatible local inference server.
 * Works with Ollama (http://localhost:11434/v1), llama.cpp server, vLLM, etc.
 *
 * Configuration:
 *   AI_LOCAL_BASE_URL → base URL of the local server (default: http://localhost:11434/v1)
 *   AI_LOCAL_MODEL     → model name to use (required, e.g. "llama3", "qwen2.5")
 *
 * Auth is optional — local servers typically don't require an API key,
 * but if AI_API_KEY is set, it will be sent as Bearer token.
 */
export class LocalAIProvider implements AIProvider {
  name = "local";

  constructor(
    private baseUrl: string,
    private model: string,
    private maxTokens: number,
    private temperature: number,
    private timeoutMs: number,
    private apiKey: string | undefined,
  ) {}

  async chat(messages: ChatMessage[], systemPrompt: string): Promise<string> {
    if (!this.model) {
      throw new Error("AI local model not configured. Set AI_LOCAL_MODEL.");
    }
    return openAICompatibleChat(
      messages,
      systemPrompt,
      this.baseUrl,
      this.model,
      this.maxTokens,
      this.temperature,
      this.timeoutMs,
      this.apiKey,
    );
  }
}

/**
 * OpenAI Provider — connects to OpenAI API or any OpenAI-compatible cloud API.
 *
 * Configuration:
 *   AI_API_KEY      → API key (required)
 *   AI_API_BASE_URL → base URL (default: https://api.openai.com/v1)
 *   AI_MODEL        → model name (default: gpt-4o-mini)
 */
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
    return openAICompatibleChat(
      messages,
      systemPrompt,
      this.baseUrl,
      this.model,
      this.maxTokens,
      this.temperature,
      this.timeoutMs,
      this.apiKey,
    );
  }
}

/**
 * Mock Provider — deterministic responses for development and testing only.
 * NEVER used as silent fallback in production (AI_FALLBACK_PROVIDER=none is default).
 */
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

/**
 * Create a provider instance from config.
 * Throws on unknown provider — no silent fallback to mock.
 */
function createProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case "local": {
      if (!config.localModel) {
        throw new Error("AI_PROVIDER=local requires AI_LOCAL_MODEL to be set.");
      }
      return new LocalAIProvider(
        config.localBaseUrl,
        config.localModel,
        config.maxTokens,
        config.temperature,
        config.timeoutMs,
        config.apiKey, // optional auth for local servers
      );
    }
    case "openai": {
      if (!config.apiKey) {
        throw new Error("AI_PROVIDER=openai requires AI_API_KEY to be set.");
      }
      return new OpenAIProvider(
        config.apiKey,
        config.apiBaseUrl,
        config.model,
        config.maxTokens,
        config.temperature,
        config.timeoutMs,
      );
    }
    case "mock":
      return new MockAIProvider();
    default:
      throw new Error(
        `Unknown AI_PROVIDER: "${config.provider}". ` +
          `Valid options: ${VALID_PROVIDERS.join(", ")}.`,
      );
  }
}

/**
 * Get the current provider instance (cached).
 * Throws on configuration errors (unknown provider, missing required config).
 */
function getProvider(): AIProvider {
  const config = getConfig();

  if (_provider && _providerName === config.provider) return _provider;

  _provider = createProvider(config);
  _providerName = config.provider;
  return _provider;
}

/**
 * Get the configured fallback provider.
 * Returns null if AI_FALLBACK_PROVIDER=none (the default — no fake AI in production).
 */
function getFallbackProvider(): AIProvider | null {
  const config = getConfig();
  switch (config.fallbackProvider) {
    case "mock":
      return new MockAIProvider();
    case "none":
    default:
      return null;
  }
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

export async function checkAIRateLimit(uid: string): Promise<RateLimitResult> {
  const config = getConfig();
  if (env("FIRESTORE_EMULATOR_HOST") || env("SKIP_RATE_LIMIT")) {
    return { allowed: true, remaining: config.rateLimitPerHour };
  }

  try {
    const { getProjectId, getAccessToken } = await import("./firebase-admin.server");
    const projectId = getProjectId();
    const since = Date.now() - 60 * 60 * 1000;

    const fsBase = env("FIRESTORE_EMULATOR_HOST")
      ? `${env("FIRESTORE_EMULATOR_HOST")}/v1/projects/${projectId}`
      : `https://firestore.googleapis.com/v1/projects/${projectId}`;

    const parentPath = `users/${uid}`;
    const res = await fetch(
      `${fsBase}/databases/(default)/documents/${parentPath}/aiRequests:runQuery`,
      {
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
      },
    );

    if (!res.ok) {
      return { allowed: true, remaining: config.rateLimitPerHour };
    }

    const rows = (await res.json()) as unknown[];
    const count = rows.length;
    return {
      allowed: count < config.rateLimitPerHour,
      remaining: Math.max(0, config.rateLimitPerHour - count),
    };
  } catch {
    return { allowed: true, remaining: config.rateLimitPerHour };
  }
}

export async function recordAIRequest(uid: string): Promise<void> {
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

/**
 * User-facing error message when the AI provider fails and no fallback is configured.
 * This is shown to the user — it's honest, not a fake AI response.
 */
const PROVIDER_ERROR_MESSAGE =
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

  // 3. Truncate history to configured max
  const trimmedHistory = history.slice(-config.maxHistory);

  // 4. Build messages
  const messages: ChatMessage[] = [...trimmedHistory, { role: "user", content: message }];

  // 5. Get provider (throws on misconfiguration — no silent fallback)
  const provider = getProvider();

  try {
    const reply = await provider.chat(messages, config.systemPrompt);
    void recordAIRequest(uid);
    return { reply, source: provider.name === "mock" ? "fallback" : "ai" };
  } catch (providerErr) {
    // 6. Check if a fallback provider is configured
    const fallback = getFallbackProvider();

    if (fallback) {
      // Development mode: AI_FALLBACK_PROVIDER=mock
      try {
        const reply = await fallback.chat(messages, config.systemPrompt);
        return { reply, source: "fallback" };
      } catch {
        // Even fallback failed — return honest error
        return { reply: PROVIDER_ERROR_MESSAGE, source: "error" };
      }
    }

    // Production mode: AI_FALLBACK_PROVIDER=none (default)
    // Return an honest error message, NOT a fake AI response
    return { reply: PROVIDER_ERROR_MESSAGE, source: "error" };
  }
}

export { getConfig, getProvider, createProvider, getFallbackProvider };
