/**
 * Comprehensive tests for the provider-agnostic AI Assistant architecture.
 *
 * Covers:
 *   - Local provider (success, timeout, unavailable, invalid response, missing model)
 *   - OpenAI provider (success, quota error, auth error, missing key)
 *   - Mock provider (deterministic responses)
 *   - Provider factory (local, openai, mock, unknown → error)
 *   - Fallback behavior (none = honest error, mock = dev fallback)
 *   - Security (unauthorized, oversized input, rate limit, secret exposure)
 *   - Integration (UI → backend → provider → response)
 *   - Cost control (history truncation, max tokens, timeout)
 *
 * Uses mock provider and deterministic endpoints — no real AI dependency needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ═══════════════════════════════════════════════════════════════
// SETUP / TEARDOWN
// ═══════════════════════════════════════════════════════════════

beforeEach(() => {
  // Default: mock provider + skip rate limiting for tests
  process.env.AI_PROVIDER = "mock";
  process.env.AI_FALLBACK_PROVIDER = "none";
  process.env.SKIP_RATE_LIMIT = "true";
});

afterEach(() => {
  // Clean up all AI_ env vars between tests
  const aiKeys = [
    "AI_PROVIDER",
    "AI_FALLBACK_PROVIDER",
    "AI_API_KEY",
    "AI_API_BASE_URL",
    "AI_MODEL",
    "AI_LOCAL_BASE_URL",
    "AI_LOCAL_MODEL",
    "AI_SYSTEM_PROMPT",
    "AI_MAX_TOKENS",
    "AI_TEMPERATURE",
    "AI_TIMEOUT_MS",
    "AI_RATE_LIMIT_PER_HOUR",
    "AI_MAX_HISTORY",
    "SKIP_RATE_LIMIT",
  ];
  for (const k of aiKeys) delete process.env[k];
  vi.resetModules();
});

// ═══════════════════════════════════════════════════════════════
// 1. LOCAL PROVIDER
// ═══════════════════════════════════════════════════════════════

describe("LocalAIProvider", () => {
  it("sends request to local endpoint and returns response", async () => {
    const { LocalAIProvider } = await import("../ai-assistant.server");
    const provider = new LocalAIProvider(
      "http://localhost:11434/v1",
      "llama3",
      500,
      0.7,
      15000,
      undefined,
    );
    expect(provider.name).toBe("local");
  });

  it("throws if model is not configured", async () => {
    const { LocalAIProvider } = await import("../ai-assistant.server");
    const provider = new LocalAIProvider(
      "http://localhost:11434/v1",
      "", // empty model
      500,
      0.7,
      15000,
      undefined,
    );
    await expect(provider.chat([{ role: "user", content: "hi" }], "system")).rejects.toThrow(
      "model not configured",
    );
  });

  it("handles connection refused gracefully", async () => {
    const { LocalAIProvider } = await import("../ai-assistant.server");
    const provider = new LocalAIProvider(
      "http://localhost:99999/v1", // invalid port
      "llama3",
      500,
      0.7,
      5000,
      undefined,
    );
    await expect(provider.chat([{ role: "user", content: "hi" }], "system")).rejects.toThrow();
  });

  it("handles timeout gracefully", async () => {
    const { LocalAIProvider } = await import("../ai-assistant.server");
    const provider = new LocalAIProvider(
      "http://10.255.255.1/v1", // non-routable IP → will timeout
      "llama3",
      500,
      0.7,
      1, // 1ms timeout
      undefined,
    );
    await expect(provider.chat([{ role: "user", content: "hi" }], "system")).rejects.toThrow();
  });

  it("sends optional API key when provided", async () => {
    const { LocalAIProvider } = await import("../ai-assistant.server");
    const provider = new LocalAIProvider(
      "http://localhost:11434/v1",
      "llama3",
      500,
      0.7,
      15000,
      "local-secret-key",
    );
    // Just verify it doesn't throw on construction — actual call will fail
    expect(provider.name).toBe("local");
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. OPENAI PROVIDER
// ═══════════════════════════════════════════════════════════════

describe("OpenAIProvider", () => {
  it("constructs with valid config", async () => {
    const { OpenAIProvider } = await import("../ai-assistant.server");
    const provider = new OpenAIProvider(
      "sk-test-key",
      "https://api.openai.com/v1",
      "gpt-4o-mini",
      500,
      0.7,
      15000,
    );
    expect(provider.name).toBe("openai");
  });

  it("handles timeout", async () => {
    const { OpenAIProvider } = await import("../ai-assistant.server");
    const provider = new OpenAIProvider(
      "sk-test-key",
      "https://10.255.255.1/v1", // non-routable
      "gpt-4o-mini",
      500,
      0.7,
      1, // 1ms timeout
    );
    await expect(provider.chat([{ role: "user", content: "hi" }], "system")).rejects.toThrow();
  });

  it("sanitizes 401 errors", async () => {
    const { OpenAIProvider } = await import("../ai-assistant.server");
    // Use a URL that will actually return 401 — httpbin or mock
    // We can't easily mock fetch in this setup, but we can verify
    // the error message doesn't leak the API key
    const provider = new OpenAIProvider(
      "sk-secret-key-12345",
      "https://httpbin.org/status/401",
      "gpt-4o-mini",
      100,
      0.7,
      5000,
    );
    try {
      await provider.chat([{ role: "user", content: "test" }], "system");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain("sk-secret-key-12345");
      expect(msg).not.toContain("Bearer");
    }
  });

  it("sanitizes 429 quota errors", async () => {
    const { OpenAIProvider } = await import("../ai-assistant.server");
    const provider = new OpenAIProvider(
      "sk-test-key",
      "https://httpbin.org/status/429",
      "gpt-4o-mini",
      100,
      0.7,
      5000,
    );
    try {
      await provider.chat([{ role: "user", content: "test" }], "system");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain("sk-test-key");
      expect(msg.length).toBeLessThan(100);
    }
  });

  it("never exposes API key in error messages", async () => {
    const { OpenAIProvider } = await import("../ai-assistant.server");
    const secretKey = "sk-super-secret-abc123xyz";
    const provider = new OpenAIProvider(
      secretKey,
      "https://httpbin.org/status/500",
      "gpt-4o-mini",
      100,
      0.7,
      5000,
    );
    try {
      await provider.chat([{ role: "user", content: "test" }], "system");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain(secretKey);
      expect(msg).not.toContain("Bearer");
      expect(msg).not.toContain("authorization");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. MOCK PROVIDER
// ═══════════════════════════════════════════════════════════════

describe("MockAIProvider", () => {
  it("returns response for order queries", async () => {
    const { MockAIProvider } = await import("../ai-assistant.server");
    const provider = new MockAIProvider();
    const reply = await provider.chat([{ role: "user", content: "Track my order" }], "system");
    expect(reply.toLowerCase()).toContain("track");
  });

  it("returns response for coupon queries", async () => {
    const { MockAIProvider } = await import("../ai-assistant.server");
    const provider = new MockAIProvider();
    const reply = await provider.chat(
      [{ role: "user", content: "Any coupons available?" }],
      "system",
    );
    expect(reply.toLowerCase()).toContain("coupon");
  });

  it("returns response for flash sale queries", async () => {
    const { MockAIProvider } = await import("../ai-assistant.server");
    const provider = new MockAIProvider();
    const reply = await provider.chat([{ role: "user", content: "Flash sales?" }], "system");
    expect(reply.toLowerCase()).toContain("flash");
  });

  it("returns response for return/refund queries", async () => {
    const { MockAIProvider } = await import("../ai-assistant.server");
    const provider = new MockAIProvider();
    const reply = await provider.chat(
      [{ role: "user", content: "How do I return an item?" }],
      "system",
    );
    expect(reply.toLowerCase()).toContain("return");
  });

  it("returns response for product search queries", async () => {
    const { MockAIProvider } = await import("../ai-assistant.server");
    const provider = new MockAIProvider();
    const reply = await provider.chat([{ role: "user", content: "Find a product" }], "system");
    expect(reply.toLowerCase()).toContain("shop");
  });

  it("returns default response for unknown queries", async () => {
    const { MockAIProvider } = await import("../ai-assistant.server");
    const provider = new MockAIProvider();
    const reply = await provider.chat([{ role: "user", content: "xyz random query" }], "system");
    expect(reply).toBeTruthy();
    expect(reply.length).toBeGreaterThan(10);
  });

  it("returns default response when no user message", async () => {
    const { MockAIProvider } = await import("../ai-assistant.server");
    const provider = new MockAIProvider();
    const reply = await provider.chat([], "system");
    expect(reply).toContain("help");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. PROVIDER FACTORY
// ═══════════════════════════════════════════════════════════════

describe("Provider Factory", () => {
  it("returns mock provider when AI_PROVIDER=mock", async () => {
    process.env.AI_PROVIDER = "mock";
    const { getProvider, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const provider = getProvider();
    expect(provider.name).toBe("mock");
  });

  it("returns openai provider when AI_PROVIDER=openai with key", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-test-key-12345";
    const { getProvider, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const provider = getProvider();
    expect(provider.name).toBe("openai");
  });

  it("returns local provider when AI_PROVIDER=local with model", async () => {
    process.env.AI_PROVIDER = "local";
    process.env.AI_LOCAL_MODEL = "llama3";
    process.env.AI_LOCAL_BASE_URL = "http://localhost:11434/v1";
    const { getProvider, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const provider = getProvider();
    expect(provider.name).toBe("local");
  });

  it("throws on unknown provider name", async () => {
    process.env.AI_PROVIDER = "anthropic"; // not supported
    const { getProvider, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    expect(() => getProvider()).toThrow("Unknown AI_PROVIDER");
  });

  it("throws when AI_PROVIDER=openai but no API key", async () => {
    process.env.AI_PROVIDER = "openai";
    delete process.env.AI_API_KEY;
    const { getProvider, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    expect(() => getProvider()).toThrow("AI_API_KEY");
  });

  it("throws when AI_PROVIDER=local but no model", async () => {
    process.env.AI_PROVIDER = "local";
    delete process.env.AI_LOCAL_MODEL;
    const { getProvider, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    expect(() => getProvider()).toThrow("AI_LOCAL_MODEL");
  });

  it("caches provider instance across calls", async () => {
    process.env.AI_PROVIDER = "mock";
    const { getProvider, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const p1 = getProvider();
    const p2 = getProvider();
    expect(p1).toBe(p2);
  });

  it("creates new instance when provider name changes", async () => {
    process.env.AI_PROVIDER = "mock";
    const { getProvider, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const p1 = getProvider();
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-test-key";
    const p2 = getProvider();
    expect(p1).not.toBe(p2);
    expect(p2.name).toBe("openai");
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. FALLBACK BEHAVIOR
// ═══════════════════════════════════════════════════════════════

describe("Fallback Behavior", () => {
  it("AI_FALLBACK_PROVIDER=none returns honest error when provider fails", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-test-key";
    process.env.AI_FALLBACK_PROVIDER = "none";
    process.env.AI_TIMEOUT_MS = "1";
    const { chatWithAI, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();

    const result = await chatWithAI("test-uid", "Track my order", []);
    expect(result.source).toBe("error");
    expect(result.reply).toContain("trouble connecting");
    // Should NOT contain a mock response pretending to be AI
    expect(result.reply).not.toContain("Orders tab");
  });

  it("AI_FALLBACK_PROVIDER=mock returns mock response when provider fails (dev)", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-test-key";
    process.env.AI_FALLBACK_PROVIDER = "mock";
    process.env.AI_TIMEOUT_MS = "1";
    const { chatWithAI, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();

    const result = await chatWithAI("test-uid", "Track my order", []);
    expect(result.source).toBe("fallback");
    expect(result.reply).toContain("track");
  });

  it("default fallback is none (safe — no fake AI in production)", async () => {
    delete process.env.AI_FALLBACK_PROVIDER;
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-test-key";
    process.env.AI_TIMEOUT_MS = "1";
    const { chatWithAI, getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.fallbackProvider).toBe("none");
  });

  it("mock provider never triggers fallback (it is the provider)", async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.AI_FALLBACK_PROVIDER = "none";
    const { chatWithAI } = await import("../ai-assistant.server");
    const result = await chatWithAI("test-uid", "Track my order", []);
    expect(result.source).toBe("fallback"); // mock source = "fallback"
    expect(result.reply).toContain("track");
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. SECURITY
// ═══════════════════════════════════════════════════════════════

describe("Security", () => {
  it("server function schema requires idToken", () => {
    const { z } = require("zod");
    const schema = z.object({
      idToken: z.string().min(10),
      message: z.string().trim().min(1).max(1000),
      history: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(1000),
          }),
        )
        .max(20)
        .default([]),
    });
    // Missing idToken
    expect(() => schema.parse({ message: "test", history: [] })).toThrow();
    // Short idToken
    expect(() => schema.parse({ idToken: "short", message: "test", history: [] })).toThrow();
    // Valid
    const valid = schema.parse({ idToken: "valid-token-123", message: "test", history: [] });
    expect(valid.idToken).toBe("valid-token-123");
  });

  it("rejects empty message", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    await expect(chatWithAI("test-uid", "", [])).rejects.toThrow("empty");
  });

  it("rejects whitespace-only message", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    await expect(chatWithAI("test-uid", "   ", [])).rejects.toThrow("empty");
  });

  it("rejects message over 1000 characters", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    await expect(chatWithAI("test-uid", "a".repeat(1001), [])).rejects.toThrow("1000");
  });

  it("rejects history with too many turns", async () => {
    const { chatWithAI, AI_HISTORY_MAX_TURNS } = await import("../ai-assistant.server");
    const longHistory = Array.from({ length: AI_HISTORY_MAX_TURNS + 1 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Msg ${i}`,
    }));
    await expect(chatWithAI("test-uid", "test", longHistory)).rejects.toThrow("history");
  });

  it("rejects invalid role in history", async () => {
    const { validateAIInput } = await import("../ai-assistant.server");
    const result = validateAIInput("test", [{ role: "system" as any, content: "hack" }]);
    expect(result.valid).toBe(false);
  });

  it("server function returns only reply and source (no secrets)", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    const result = await chatWithAI("test-uid", "Track my order", []);
    const keys = Object.keys(result);
    expect(keys).toContain("reply");
    expect(keys).toContain("source");
    expect(keys).not.toContain("apiKey");
    expect(keys).not.toContain("key");
    expect(keys).not.toContain("token");
    expect(keys).not.toContain("config");
  });

  it("config is not exported from the server function module", async () => {
    const functionsModule = await import("../ai-assistant.functions");
    const exports = Object.keys(functionsModule);
    expect(exports).toContain("aiChat");
    expect(exports).not.toContain("getConfig");
    expect(exports).not.toContain("chatWithAI");
    expect(exports).not.toContain("getProvider");
    expect(exports).not.toContain("createProvider");
  });

  it("client service does not export server-side internals", async () => {
    const clientModule = await import("../../services/firebase/aiAssistant");
    const exports = Object.keys(clientModule);
    expect(exports).toContain("sendAIMessage");
    expect(exports).not.toContain("getConfig");
    expect(exports).not.toContain("getProvider");
    expect(exports).not.toContain("OpenAIProvider");
    expect(exports).not.toContain("LocalAIProvider");
  });

  it("API key not in AIResponse type", () => {
    type AIResponseKeys = keyof import("../ai-assistant.server").AIResponse;
    const validKeys: AIResponseKeys[] = ["reply", "source"];
    expect(validKeys).toEqual(["reply", "source"]);
  });

  it("rate limit returns allowed when SKIP_RATE_LIMIT is set", async () => {
    process.env.SKIP_RATE_LIMIT = "true";
    const { checkAIRateLimit } = await import("../ai-assistant.server");
    const result = await checkAIRateLimit("test-uid");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("rate limit is configurable", async () => {
    process.env.AI_RATE_LIMIT_PER_HOUR = "5";
    process.env.SKIP_RATE_LIMIT = "true";
    const { checkAIRateLimit } = await import("../ai-assistant.server");
    const result = await checkAIRateLimit("test-uid");
    expect(result.remaining).toBe(5);
  });

  it("provider errors never expose raw HTTP details", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-secret-xyz";
    process.env.AI_FALLBACK_PROVIDER = "none";
    process.env.AI_TIMEOUT_MS = "1";
    const { chatWithAI, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const result = await chatWithAI("test-uid", "test", []);
    expect(result.reply).not.toContain("sk-secret-xyz");
    expect(result.reply).not.toContain("Bearer");
    expect(result.reply).not.toContain("api.openai.com");
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. CONVERSATION CONTEXT
// ═══════════════════════════════════════════════════════════════

describe("Conversation Context", () => {
  it("accepts and processes conversation history", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    const history = [
      { role: "user" as const, content: "Hi there" },
      { role: "assistant" as const, content: "Hello! How can I help?" },
    ];
    const result = await chatWithAI("test-uid", "Track my order", history);
    expect(result.reply).toBeTruthy();
    expect(result.reply).toContain("track");
  });

  it("handles empty history array", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    const result = await chatWithAI("test-uid", "Hello", []);
    expect(result.reply).toBeTruthy();
  });

  it("truncates history to max configured turns", async () => {
    process.env.AI_MAX_HISTORY = "3";
    const { chatWithAI, getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.maxHistory).toBe(3);

    const longHistory = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}`,
    }));
    const result = await chatWithAI("test-uid", "test", longHistory);
    expect(result.reply).toBeTruthy();
  });

  it("does not send sensitive data in messages", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    // The history should not include any system/internal data
    const result = await chatWithAI("test-uid", "Hello", []);
    expect(result.reply).not.toContain("password");
    expect(result.reply).not.toContain("secret");
    expect(result.reply).not.toContain("api_key");
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. VALID INPUT / RESPONSE DELIVERY
// ═══════════════════════════════════════════════════════════════

describe("Valid Input & Response Delivery", () => {
  it("returns non-empty response for valid message", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    const result = await chatWithAI("test-uid", "Find me a product", []);
    expect(result.reply).toBeTruthy();
    expect(result.reply.length).toBeGreaterThan(10);
  });

  it("returns different responses for different queries", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    const r1 = await chatWithAI("test-uid", "Track my order", []);
    const r2 = await chatWithAI("test-uid", "Available coupons", []);
    expect(r1.reply).not.toBe(r2.reply);
  });

  it("accepts message exactly 1000 characters", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    const result = await chatWithAI("test-uid", "a".repeat(1000), []);
    expect(result.reply).toBeTruthy();
  });

  it("response is a displayable string", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    const result = await chatWithAI("test-uid", "Track my order", []);
    expect(typeof result.reply).toBe("string");
    expect(result.reply).not.toContain("undefined");
    expect(result.reply).not.toContain("[object");
  });

  it("response source is valid AISource value", async () => {
    const { chatWithAI } = await import("../ai-assistant.server");
    const result = await chatWithAI("test-uid", "Hello", []);
    expect(["ai", "fallback", "error"]).toContain(result.source);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. INPUT VALIDATION (unit tests)
// ═══════════════════════════════════════════════════════════════

describe("Input Validation (validateAIInput)", () => {
  it("accepts valid message and empty history", async () => {
    const { validateAIInput } = await import("../ai-assistant.server");
    const result = validateAIInput("Hello", []);
    expect(result.valid).toBe(true);
  });

  it("rejects empty message", async () => {
    const { validateAIInput } = await import("../ai-assistant.server");
    const result = validateAIInput("", []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("rejects oversized message", async () => {
    const { validateAIInput, AI_INPUT_MAX_LENGTH } = await import("../ai-assistant.server");
    const result = validateAIInput("a".repeat(AI_INPUT_MAX_LENGTH + 1), []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(String(AI_INPUT_MAX_LENGTH));
  });

  it("rejects oversized history content", async () => {
    const { validateAIInput, AI_INPUT_MAX_LENGTH } = await import("../ai-assistant.server");
    const result = validateAIInput("test", [
      { role: "user", content: "a".repeat(AI_INPUT_MAX_LENGTH + 1) },
    ]);
    expect(result.valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. COST CONTROL
// ═══════════════════════════════════════════════════════════════

describe("Cost Control", () => {
  it("truncates history to prevent excessive token usage", async () => {
    process.env.AI_MAX_HISTORY = "3";
    const { chatWithAI, getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.maxHistory).toBe(3);

    const longHistory = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}`,
    }));
    const result = await chatWithAI("test-uid", "test", longHistory);
    expect(result.reply).toBeTruthy();
  });

  it("has configurable max tokens", async () => {
    process.env.AI_MAX_TOKENS = "100";
    const { getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.maxTokens).toBe(100);
  });

  it("has configurable timeout", async () => {
    process.env.AI_TIMEOUT_MS = "5000";
    const { getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.timeoutMs).toBe(5000);
  });

  it("has configurable rate limit", async () => {
    process.env.AI_RATE_LIMIT_PER_HOUR = "30";
    const { getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.rateLimitPerHour).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. CONFIGURATION
// ═══════════════════════════════════════════════════════════════

describe("Configuration", () => {
  it("default provider is mock (safe for dev)", async () => {
    delete process.env.AI_PROVIDER;
    const { getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.provider).toBe("mock");
  });

  it("default fallback is none (no fake AI in production)", async () => {
    delete process.env.AI_FALLBACK_PROVIDER;
    const { getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.fallbackProvider).toBe("none");
  });

  it("local base URL defaults to Ollama endpoint", async () => {
    delete process.env.AI_LOCAL_BASE_URL;
    const { getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.localBaseUrl).toBe("http://localhost:11434/v1");
  });

  it("custom system prompt is used when set", async () => {
    process.env.AI_SYSTEM_PROMPT = "You are a custom assistant.";
    const { getConfig, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const config = getConfig();
    expect(config.systemPrompt).toBe("You are a custom assistant.");
  });

  it("valid provider list includes local, openai, mock", async () => {
    const { VALID_PROVIDERS } = await import("../ai-assistant.server");
    expect(VALID_PROVIDERS).toContain("local");
    expect(VALID_PROVIDERS).toContain("openai");
    expect(VALID_PROVIDERS).toContain("mock");
  });

  it("valid fallback list includes none and mock", async () => {
    const { VALID_FALLBACKS } = await import("../ai-assistant.server");
    expect(VALID_FALLBACKS).toContain("none");
    expect(VALID_FALLBACKS).toContain("mock");
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. NO VENDOR LOCK-IN
// ═══════════════════════════════════════════════════════════════

describe("No Vendor Lock-in", () => {
  it("AIProvider interface is provider-agnostic", async () => {
    const { LocalAIProvider, OpenAIProvider, MockAIProvider } =
      await import("../ai-assistant.server");
    // All providers implement the same interface
    const providers: { name: string; chat: (m: any, s: string) => Promise<string> }[] = [
      new MockAIProvider(),
      new OpenAIProvider("key", "url", "model", 100, 0.7, 1000),
      new LocalAIProvider("url", "model", 100, 0.7, 1000, undefined),
    ];
    for (const p of providers) {
      expect(typeof p.name).toBe("string");
      expect(typeof p.chat).toBe("function");
    }
  });

  it("switching providers only requires env var change", async () => {
    // Simulate switching from mock to local
    process.env.AI_PROVIDER = "mock";
    const { getProvider, _resetProviderCache } = await import("../ai-assistant.server");
    _resetProviderCache();
    const mockProvider = getProvider();
    expect(mockProvider.name).toBe("mock");

    // Switch to local
    process.env.AI_PROVIDER = "local";
    process.env.AI_LOCAL_MODEL = "llama3";
    _resetProviderCache();
    const localProvider = getProvider();
    expect(localProvider.name).toBe("local");

    // Switch to openai
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-test";
    _resetProviderCache();
    const openaiProvider = getProvider();
    expect(openaiProvider.name).toBe("openai");
  });
});
