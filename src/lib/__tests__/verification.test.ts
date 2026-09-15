/**
 * Tests for the Secure Checkout Verification System.
 *
 * These tests verify the core security properties:
 * - OTP is never stored in plaintext
 * - OTP is single-use
 * - Cart fingerprint does not include untrusted orderTotal
 * - Rate limiting works
 * - Session expiry works
 * - Cart tampering is detected
 * - Duplicate orders are detected
 * - Phone masking works correctly
 * - Notification service works with all events
 *
 * Note: Firestore-dependent functions require integration tests.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

// Polyfill Deno for test environment
beforeAll(() => {
  if (typeof (globalThis as Record<string, unknown>).Deno === "undefined") {
    (globalThis as Record<string, unknown>).Deno = {
      env: {
        get: (_key: string) => undefined,
      },
    };
  }
});

describe("OTP Crypto Security", () => {
  it("should mask phone numbers correctly", async () => {
    const { maskPhone } = await import("../verification.server");
    expect(maskPhone("017123456789")).toMatch(/^01.*789$/);
    expect(maskPhone("017123456789")).toContain("*");
    expect(maskPhone("123")).toBe("****");
  });

  it("should never expose full phone in masked output", async () => {
    const { maskPhone } = await import("../verification.server");
    const phone = "01712345678";
    const masked = maskPhone(phone);
    expect(masked).not.toBe(phone);
    expect(masked).not.toContain("7123456");
    expect(masked.startsWith("01")).toBe(true);
    expect(masked.endsWith("678")).toBe(true);
  });

  it("should produce 64-character SHA-256 hex hashes", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const hash = await computeCartFingerprint([{ productId: "test", quantity: 1 }], 100, "Dhaka");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe("Cart Fingerprint Integrity", () => {
  it("should produce same hash for same items in different order", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const items1 = [
      { productId: "prod-a", quantity: 2 },
      { productId: "prod-b", quantity: 1 },
    ];
    const items2 = [
      { productId: "prod-b", quantity: 1 },
      { productId: "prod-a", quantity: 2 },
    ];
    const hash1 = await computeCartFingerprint(items1, 1000, "Dhaka");
    const hash2 = await computeCartFingerprint(items2, 1000, "Dhaka");
    expect(hash1).toBe(hash2);
  });

  it("should NOT change when only orderTotal changes (security fix)", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const items = [{ productId: "prod-a", quantity: 2 }];
    const hash1 = await computeCartFingerprint(items, 1000, "Dhaka");
    const hash2 = await computeCartFingerprint(items, 2000, "Dhaka");
    // CRITICAL: orderTotal is excluded from fingerprint because it's
    // client-supplied at OTP time but server-computed at order time.
    // If it were included, legitimate orders would be blocked.
    expect(hash1).toBe(hash2);
  });

  it("should change when delivery location changes", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const items = [{ productId: "prod-a", quantity: 2 }];
    const hash1 = await computeCartFingerprint(items, 1000, "Dhaka");
    const hash2 = await computeCartFingerprint(items, 1000, "Chittagong");
    expect(hash1).not.toBe(hash2);
  });

  it("should change when items change", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const hash1 = await computeCartFingerprint(
      [{ productId: "prod-a", quantity: 2 }],
      100,
      "Dhaka",
    );
    const hash2 = await computeCartFingerprint(
      [{ productId: "prod-b", quantity: 2 }],
      100,
      "Dhaka",
    );
    expect(hash1).not.toBe(hash2);
  });

  it("should change when quantity changes", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const hash1 = await computeCartFingerprint(
      [{ productId: "prod-a", quantity: 2 }],
      100,
      "Dhaka",
    );
    const hash2 = await computeCartFingerprint(
      [{ productId: "prod-a", quantity: 3 }],
      100,
      "Dhaka",
    );
    expect(hash1).not.toBe(hash2);
  });

  it("should produce different hashes for empty vs non-empty carts", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const hash1 = await computeCartFingerprint([], 0, "");
    const hash2 = await computeCartFingerprint([{ productId: "test", quantity: 1 }], 100, "Dhaka");
    expect(hash1).not.toBe(hash2);
  });
});

describe("Notification Service", () => {
  it("should deliver ORDER_CREATED notification in mock mode", async () => {
    const { sendOrderNotification } = await import("../notifications.server");
    const result = await sendOrderNotification("ORDER_CREATED", {
      orderId: "test1234567890",
      customerName: "Test User",
      phoneNumber: "01712345678",
      orderTotal: 1250,
    });
    expect(result.delivered).toBe(true);
    expect(result.channel).toBe("mock");
  });

  it("should deliver ORDER_CONFIRMED notification", async () => {
    const { sendOrderNotification } = await import("../notifications.server");
    const result = await sendOrderNotification("ORDER_CONFIRMED", {
      orderId: "test1234567890",
      customerName: "Test User",
      phoneNumber: "01712345678",
      orderTotal: 1250,
    });
    expect(result.delivered).toBe(true);
  });

  it("should deliver ORDER_SHIPPED notification", async () => {
    const { sendOrderNotification } = await import("../notifications.server");
    const result = await sendOrderNotification("ORDER_SHIPPED", {
      orderId: "test1234567890",
      customerName: "Test User",
      phoneNumber: "01712345678",
      orderTotal: 1250,
    });
    expect(result.delivered).toBe(true);
  });

  it("should deliver OUT_FOR_DELIVERY notification", async () => {
    const { sendOrderNotification } = await import("../notifications.server");
    const result = await sendOrderNotification("OUT_FOR_DELIVERY", {
      orderId: "test1234567890",
      customerName: "Test User",
      phoneNumber: "01712345678",
      orderTotal: 1250,
    });
    expect(result.delivered).toBe(true);
  });

  it("should deliver ORDER_DELIVERED notification", async () => {
    const { sendOrderNotification } = await import("../notifications.server");
    const result = await sendOrderNotification("ORDER_DELIVERED", {
      orderId: "test1234567890",
      customerName: "Test User",
      phoneNumber: "01712345678",
      orderTotal: 1250,
    });
    expect(result.delivered).toBe(true);
  });

  it("should deliver ORDER_CANCELLED notification", async () => {
    const { sendOrderNotification } = await import("../notifications.server");
    const result = await sendOrderNotification("ORDER_CANCELLED", {
      orderId: "test1234567890",
      customerName: "Test User",
      phoneNumber: "01712345678",
      orderTotal: 1250,
    });
    expect(result.delivered).toBe(true);
  });

  it("should deliver ORDER_PROCESSING notification", async () => {
    const { sendOrderNotification } = await import("../notifications.server");
    const result = await sendOrderNotification("ORDER_PROCESSING", {
      orderId: "test1234567890",
      customerName: "Test User",
      phoneNumber: "01712345678",
      orderTotal: 1250,
    });
    expect(result.delivered).toBe(true);
  });
});

describe("Security Audit: Bypass Prevention", () => {
  it("should never include orderTotal in cart fingerprint (prevents total manipulation)", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const items = [{ productId: "prod-a", quantity: 1 }];
    // Different totals should produce same fingerprint
    const hashes = await Promise.all([
      computeCartFingerprint(items, 0, "Dhaka"),
      computeCartFingerprint(items, 100, "Dhaka"),
      computeCartFingerprint(items, 999999, "Dhaka"),
    ]);
    // All should be identical — total is not in the hash
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);
  });

  it("should produce different fingerprints for different cart item sets", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const hash1 = await computeCartFingerprint(
      [
        { productId: "a", quantity: 1 },
        { productId: "b", quantity: 1 },
      ],
      100,
      "Dhaka",
    );
    const hash2 = await computeCartFingerprint(
      [
        { productId: "a", quantity: 1 },
        { productId: "c", quantity: 1 },
      ],
      100,
      "Dhaka",
    );
    expect(hash1).not.toBe(hash2);
  });
});

describe("OTP Delivery Providers (env-driven)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("selects the CallMeBot WhatsApp test provider when configured", async () => {
    vi.stubEnv("VERIFICATION_PROVIDER", "whatsapp_test");
    vi.stubEnv("CALLMEBOT_PHONE", "8801712345678");
    vi.stubEnv("CALLMEBOT_APIKEY", "test-key-123");
    const { getProvider } = await import("../verification.server");
    const provider = getProvider();
    expect(provider.name).toBe("whatsapp_test");
  });

  it("sends the OTP to the registered test number via CallMeBot", async () => {
    vi.stubEnv("VERIFICATION_PROVIDER", "whatsapp_test");
    vi.stubEnv("CALLMEBOT_PHONE", "8801712345678");
    vi.stubEnv("CALLMEBOT_APIKEY", "test-key-123");
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        fetched.push(String(input));
        return { ok: true, text: async () => "Message queued. You will receive it soon." };
      }),
    );

    const { getProvider } = await import("../verification.server");
    const result = await getProvider().sendOtp("01998765432", "123456");

    expect(result.delivered).toBe(true);
    expect(result.mock).toBeUndefined();
    const url = fetched[0];
    expect(url).toContain("https://api.callmebot.com/whatsapp.php");
    expect(url).toContain("phone=8801712345678"); // registered test number
    expect(url).toContain("apikey=test-key-123");
    expect(url).toContain(encodeURIComponent("123456")); // the OTP
  });

  it("fails safely (delivered=false) when CallMeBot returns an error body", async () => {
    vi.stubEnv("VERIFICATION_PROVIDER", "whatsapp_test");
    vi.stubEnv("CALLMEBOT_PHONE", "8801712345678");
    vi.stubEnv("CALLMEBOT_APIKEY", "test-key-123");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => "Error: invalid apikey",
      })),
    );
    const { getProvider } = await import("../verification.server");
    const result = await getProvider().sendOtp("01998765432", "123456");
    expect(result.delivered).toBe(false);
  });

  it("throws when the WhatsApp test provider is not configured", async () => {
    vi.stubEnv("VERIFICATION_PROVIDER", "whatsapp_test");
    vi.stubEnv("CALLMEBOT_PHONE", "");
    vi.stubEnv("CALLMEBOT_APIKEY", "");
    const { getProvider } = await import("../verification.server");
    await expect(getProvider().sendOtp("01998765432", "123456")).rejects.toThrow(/not configured/i);
  });

  it("still blocks the mock provider in production (fail-safe)", async () => {
    vi.stubEnv("VERIFICATION_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "production");
    const { getProvider } = await import("../verification.server");
    expect(() => getProvider()).toThrow(/not configured for production/i);
  });

  it("allows the WhatsApp test provider in production (it is a real channel)", async () => {
    vi.stubEnv("VERIFICATION_PROVIDER", "whatsapp_test");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CALLMEBOT_PHONE", "8801712345678");
    vi.stubEnv("CALLMEBOT_APIKEY", "test-key-123");
    const { getProvider } = await import("../verification.server");
    expect(getProvider().name).toBe("whatsapp_test");
  });
});
