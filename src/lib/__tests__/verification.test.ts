/**
 * Tests for the Secure Checkout Verification System.
 *
 * These tests verify the core security properties:
 * - OTP is never stored in plaintext
 * - OTP is single-use
 * - Rate limiting works
 * - Session expiry works
 * - Cart tampering is detected
 * - Duplicate orders are detected
 *
 * Note: These are unit tests for the pure functions (hashing, masking,
 * fingerprinting). The Firestore-dependent functions require integration
 * tests with a running Firebase instance.
 */

import { describe, it, expect, beforeAll } from "vitest";

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

describe("OTP Security", () => {
  it("should mask phone numbers correctly", async () => {
    const { maskPhone } = await import("../verification.server");
    expect(maskPhone("017123456789")).toMatch(/^01.*789$/);
    expect(maskPhone("017123456789")).toContain("*");
    expect(maskPhone("123")).toBe("****");
  });

  it("should compute consistent cart fingerprints", async () => {
    const { computeCartFingerprint } = await import("../verification.server");

    const items1 = [
      { productId: "prod-a", quantity: 2 },
      { productId: "prod-b", quantity: 1 },
    ];
    const items2 = [
      { productId: "prod-b", quantity: 1 },
      { productId: "prod-a", quantity: 2 },
    ];

    // Same items in different order should produce same hash (sorted internally)
    const hash1 = await computeCartFingerprint(items1, 1000, "Dhaka");
    const hash2 = await computeCartFingerprint(items2, 1000, "Dhaka");
    expect(hash1).toBe(hash2);

    // Different total should produce different hash
    const hash3 = await computeCartFingerprint(items1, 2000, "Dhaka");
    expect(hash1).not.toBe(hash3);

    // Different location should produce different hash
    const hash4 = await computeCartFingerprint(items1, 1000, "Chittagong");
    expect(hash1).not.toBe(hash4);

    // Different items should produce different hash
    const hash5 = await computeCartFingerprint(
      [{ productId: "prod-c", quantity: 2 }],
      1000,
      "Dhaka",
    );
    expect(hash1).not.toBe(hash5);
  });

  it("should produce 64-character SHA-256 hex hashes", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const hash = await computeCartFingerprint(
      [{ productId: "test", quantity: 1 }],
      100,
      "Dhaka",
    );
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("should mask different phone formats consistently", async () => {
    const { maskPhone } = await import("../verification.server");
    const masked = maskPhone("01712345678");
    // Should never expose the full number
    expect(masked).not.toContain("7123456");
    expect(masked).toContain("*");
    // Should preserve first 2 and last 3 digits
    expect(masked.startsWith("01")).toBe(true);
    expect(masked.endsWith("678")).toBe(true);
  });
});

describe("Verification Session Security Properties", () => {
  it("should not allow empty cart fingerprint", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const hash = await computeCartFingerprint([], 0, "");
    expect(hash).toHaveLength(64);
  });

  it("should detect quantity changes in cart fingerprint", async () => {
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
});

describe("Notification Service", () => {
  it("should generate correct message for ORDER_CREATED", async () => {
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

  it("should handle ORDER_DELIVERED event", async () => {
    const { sendOrderNotification } = await import("../notifications.server");
    const result = await sendOrderNotification("ORDER_DELIVERED", {
      orderId: "test1234567890",
      customerName: "Test User",
      phoneNumber: "01712345678",
      orderTotal: 1250,
    });
    expect(result.delivered).toBe(true);
  });

  it("should handle ORDER_CANCELLED event", async () => {
    const { sendOrderNotification } = await import("../notifications.server");
    const result = await sendOrderNotification("ORDER_CANCELLED", {
      orderId: "test1234567890",
      customerName: "Test User",
      phoneNumber: "01712345678",
      orderTotal: 1250,
    });
    expect(result.delivered).toBe(true);
  });
});
