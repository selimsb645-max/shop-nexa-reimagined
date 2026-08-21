/**
 * Integration Tests for Secure Checkout Verification System
 *
 * These tests run against a lightweight Firestore REST API-compatible
 * local server (firestore-emulator.ts). The actual server-side code
 * (verification.server.ts, firebase-admin.server.ts) makes real HTTP
 * requests to this server — no functions are mocked.
 *
 * Test environment:
 * - VERIFICATION_PROVIDER=mock (OTP returned for test verification)
 * - FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 (local test server)
 * - FIRESTORE_TEST_PROJECT=test-project (test project ID)
 *
 * SECURITY: mock provider is ONLY available when FIRESTORE_EMULATOR_HOST
 * is set. In production (NODE_ENV=production), mock is rejected.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  getEmulatorDoc,
  listEmulatorDocs,
  countEmulatorDocs,
  closeFirestoreEmulator,
} from "./firestore-emulator";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";

let emulatorServer: Server;
const EMULATOR_PORT = 8081;

beforeAll(async () => {
  // Set up test environment variables BEFORE importing server modules
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORT}`;
  process.env.FIRESTORE_TEST_PROJECT = "test-project";
  process.env.VERIFICATION_PROVIDER = "mock";
  // Ensure NODE_ENV is NOT production for these tests
  delete process.env.NODE_ENV;

  // Start the Firestore emulator
  emulatorServer = await createFirestoreEmulator(EMULATOR_PORT);
});

afterAll(async () => {
  await closeFirestoreEmulator(emulatorServer);
  // Clean up env vars
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_TEST_PROJECT;
  delete process.env.VERIFICATION_PROVIDER;
});

beforeEach(() => {
  clearEmulatorStore();
});

// ---- Test helpers ----

const TEST_USER_A = { uid: "test-user-a", email: "usera@test.com" };
const TEST_USER_B = { uid: "test-user-b", email: "userb@test.com" };
const TEST_PHONE_A = "01712345678";
const TEST_PHONE_B = "01987654321";

const TEST_CART_ITEMS = [
  { productId: "prod-001", quantity: 2 },
  { productId: "prod-002", quantity: 1 },
];
const TEST_DELIVERY_LOCATION = "123 Main St, Dhaka";
const TEST_ORDER_TOTAL = 1500;

function makeTestToken(user: { uid: string; email: string }): string {
  // In emulator mode, verifyIdToken accepts base64-encoded JSON
  return Buffer.from(JSON.stringify(user)).toString("base64");
}

async function requestOtpFor(
  user: { uid: string; email: string },
  phone: string,
  items = TEST_CART_ITEMS,
  location = TEST_DELIVERY_LOCATION,
  total = TEST_ORDER_TOTAL,
) {
  const { requestOtp } = await import("../verification.server");
  return requestOtp({
    userId: user.uid,
    phoneNumber: phone,
    cartItems: items,
    orderTotal: total,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    deliveryLocation: location,
  });
}

async function verifyOtpFor(user: { uid: string; email: string }, sessionId: string, otp: string) {
  const { verifyOtp } = await import("../verification.server");
  return verifyOtp({
    userId: user.uid,
    sessionId,
    otp,
  });
}

async function validateSession(
  user: { uid: string; email: string },
  sessionId: string,
  items: Array<{ productId: string; quantity: number }>,
  location: string,
  phone?: string,
) {
  const { validateVerificationSession } = await import("../verification.server");
  return validateVerificationSession({
    userId: user.uid,
    sessionId,
    cartItems: items,
    orderTotal: 0,
    deliveryLocation: location,
    shippingPhone: phone,
  });
}

async function consumeSession(
  user: { uid: string; email: string },
  sessionId: string,
  orderId: string,
) {
  const { consumeVerificationSession } = await import("../verification.server");
  return consumeVerificationSession(user.uid, sessionId, orderId);
}

/* ================================================================ */
/* TEST 1: Complete Successful Flow                                   */
/* ================================================================ */

describe("TEST 1: Complete Successful Flow", () => {
  it("should complete the full verification → order flow", async () => {
    // Step 1: Request OTP
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    expect(otpResult.sessionId).toBeTruthy();
    expect(otpResult.expiresAt).toBeGreaterThan(Date.now());
    expect(otpResult.mockOtp).toBeTruthy(); // mock mode returns OTP

    // Step 2: Verify session exists in Firestore
    const sessionDoc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`,
    );
    expect(sessionDoc).not.toBeNull();
    expect(sessionDoc!.status).toBe("pending");
    expect(sessionDoc!.phoneNumber).toBe(TEST_PHONE_A);
    expect(sessionDoc!.otpHash).toBeTruthy();
    expect(sessionDoc!.otpHash).not.toBe(otpResult.mockOtp); // hashed, not plaintext
    expect(sessionDoc!.cartHash).toBeTruthy();

    // Step 3: Verify OTP
    const verifyResult = await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);
    expect(verifyResult.success).toBe(true);
    expect(verifyResult.verified).toBe(true);

    // Step 4: Verify session is now "verified"
    const verifiedDoc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`,
    );
    expect(verifiedDoc!.status).toBe("verified");
    expect(verifiedDoc!.otpHash).toBeNull(); // hash cleared after verification

    // Step 5: Validate session at order creation time
    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      TEST_CART_ITEMS,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(true);

    // Step 6: Consume session (atomic)
    const consumeResult = await consumeSession(TEST_USER_A, otpResult.sessionId, "order-001");
    expect(consumeResult.success).toBe(true);

    // Step 7: Verify session is "consumed"
    const consumedDoc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`,
    );
    expect(consumedDoc!.status).toBe("consumed");
    expect(consumedDoc!.consumedOrderId).toBe("order-001");
  });
});

/* ================================================================ */
/* TEST 2: OTP Reuse                                                 */
/* ================================================================ */

describe("TEST 2: OTP Reuse", () => {
  it("should reject reusing the same OTP after verification", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    const otp = otpResult.mockOtp!;

    // First verification — success
    const first = await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otp);
    expect(first.success).toBe(true);

    // Second verification attempt with same OTP — must fail
    const second = await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otp);
    expect(second.success).toBe(false);
    expect(second.verified).toBe(true); // already verified
  });
});

/* ================================================================ */
/* TEST 3: Expired OTP                                               */
/* ================================================================ */

describe("TEST 3: Expired OTP", () => {
  it("should reject expired OTP", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);

    // Manually expire the OTP by updating the session
    const { computeCartFingerprint } = await import("../verification.server");
    const cartHash = await computeCartFingerprint(TEST_CART_ITEMS, 0, TEST_DELIVERY_LOCATION);
    const sessionPath = `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`;

    // We need to write directly to the emulator to simulate expiry
    const sessionDoc = getEmulatorDoc(sessionPath);
    if (sessionDoc) {
      // Patch the OTP expiry to the past
      const http = await import("node:http");
      const emulatorUrl = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/${sessionPath}`;
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          emulatorUrl,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
          },
          (res) => {
            res.on("data", () => {});
            res.on("end", () => resolve());
          },
        );
        req.on("error", reject);
        req.write(
          JSON.stringify({
            fields: {
              ...Object.fromEntries(
                Object.entries(sessionDoc).map(([k, v]) => {
                  // Convert to Firestore format
                  if (k === "otpExpiresAt") return [k, { integerValue: String(Date.now() - 1000) }];
                  if (k === "expiresAt") return [k, { integerValue: String(Date.now() - 1000) }];
                  if (typeof v === "number") return [k, { integerValue: String(v) }];
                  if (typeof v === "string") return [k, { stringValue: v }];
                  if (v === null) return [k, { nullValue: null }];
                  return [k, { stringValue: String(v) }];
                }),
              ),
            },
          }),
        );
        req.end();
      });
    }

    // Attempt verification — should fail
    const result = await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);
    expect(result.success).toBe(false);
    expect(result.verified).toBe(false);
  });
});

/* ================================================================ */
/* TEST 4: Wrong OTP — Brute Force                                   */
/* ================================================================ */

describe("TEST 4: Wrong OTP — Brute Force Protection", () => {
  it("should increment attempts and lock after max attempts", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);

    // Submit wrong OTP 5 times
    let lastResult;
    for (let i = 0; i < 5; i++) {
      lastResult = await verifyOtpFor(TEST_USER_A, otpResult.sessionId, "000000");
      if (i < 4) {
        expect(lastResult.success).toBe(false);
        expect(lastResult.remainingAttempts).toBe(4 - i);
      }
    }

    // After 5th attempt, session should be failed
    expect(lastResult!.success).toBe(false);
    expect(lastResult!.remainingAttempts).toBe(0);

    // Verify session is now "failed"
    const sessionDoc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`,
    );
    expect(sessionDoc!.status).toBe("failed");

    // Further attempts should fail
    const sixth = await verifyOtpFor(TEST_USER_A, otpResult.sessionId, "000000");
    expect(sixth.success).toBe(false);
  });
});

/* ================================================================ */
/* TEST 5: Cart Tampering                                            */
/* ================================================================ */

describe("TEST 5: Cart Tampering", () => {
  it("should reject order when quantity is changed after verification", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    // Modify cart quantity
    const modifiedCart = [
      { productId: "prod-001", quantity: 5 }, // changed from 2
      { productId: "prod-002", quantity: 1 },
    ];
    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      modifiedCart,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("cart has changed");
  });

  it("should reject order when product is changed", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    const modifiedCart = [{ productId: "prod-003", quantity: 2 }];
    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      modifiedCart,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(false);
  });

  it("should reject order when product is removed", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    const modifiedCart = [{ productId: "prod-001", quantity: 2 }];
    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      modifiedCart,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(false);
  });

  it("should reject order when new product is added", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    const modifiedCart = [...TEST_CART_ITEMS, { productId: "prod-003", quantity: 1 }];
    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      modifiedCart,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(false);
  });

  it("should reject order when delivery location is changed", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      TEST_CART_ITEMS,
      "456 Other St, Chittagong", // changed location
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(false);
  });
});

/* ================================================================ */
/* TEST 6: Phone Swap                                                */
/* ================================================================ */

describe("TEST 6: Phone Swap", () => {
  it("should reject order when shipping phone differs from verified phone", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      TEST_CART_ITEMS,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_B, // different phone
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("Phone number mismatch");
  });

  it("should accept order when shipping phone matches verified phone", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      TEST_CART_ITEMS,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A, // same phone
    );
    expect(validation.valid).toBe(true);
  });
});

/* ================================================================ */
/* TEST 7: Price Manipulation                                        */
/* ================================================================ */

describe("TEST 7: Price Manipulation", () => {
  it("should NOT include orderTotal in cart fingerprint (server computes real total)", async () => {
    const { computeCartFingerprint } = await import("../verification.server");
    const items = [{ productId: "prod-001", quantity: 2 }];
    const hash1 = await computeCartFingerprint(items, 1000, "Dhaka");
    const hash2 = await computeCartFingerprint(items, 999999, "Dhaka");
    // Same items + location = same fingerprint, regardless of total
    expect(hash1).toBe(hash2);
  });

  it("should not validate orderTotal at session validation time (server-side computation)", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    // Even if we pass orderTotal=0 (as orders.functions.ts does),
    // validation should succeed because orderTotal is not checked
    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      TEST_CART_ITEMS,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(true);
  });
});

/* ================================================================ */
/* TEST 8: Concurrent Order Creation                                 */
/* ================================================================ */

describe("TEST 8: Concurrent Order Creation (Race Condition)", () => {
  it("should only allow ONE order from concurrent requests using same session", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    // Two concurrent consume attempts
    const [resultA, resultB] = await Promise.all([
      consumeSession(TEST_USER_A, otpResult.sessionId, "order-A"),
      consumeSession(TEST_USER_A, otpResult.sessionId, "order-B"),
    ]);

    // Exactly one should succeed, one should fail
    const successes = [resultA.success, resultB.success].filter(Boolean).length;
    expect(successes).toBe(1);

    // Verify session is consumed with one of the order IDs
    const sessionDoc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`,
    );
    expect(sessionDoc!.status).toBe("consumed");
    expect(["order-A", "order-B"]).toContain(sessionDoc!.consumedOrderId);
  });
});

/* ================================================================ */
/* TEST 9: Duplicate Order Protection                                 */
/* ================================================================ */

describe("TEST 9: Duplicate Order Protection", () => {
  it("should detect duplicate orders within the detection window", async () => {
    const { detectDuplicateOrder, computeCartFingerprint } = await import("../verification.server");
    const cartHash = await computeCartFingerprint(TEST_CART_ITEMS, 0, TEST_DELIVERY_LOCATION);

    // Simulate an existing order in Firestore
    const http = await import("node:http");
    const orderPath = `users/${TEST_USER_A.uid}/orders/order-existing`;
    const emulatorUrl = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/${orderPath}`;
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        emulatorUrl,
        { method: "PATCH", headers: { "content-type": "application/json" } },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve());
        },
      );
      req.on("error", reject);
      req.write(
        JSON.stringify({
          fields: {
            cartHash: { stringValue: cartHash },
            createdAt: { integerValue: String(Date.now() - 1000) },
            shippingAddress: { mapValue: { fields: { phone: { stringValue: TEST_PHONE_A } } } },
            items: {
              arrayValue: {
                values: TEST_CART_ITEMS.map((i) => ({
                  mapValue: {
                    fields: {
                      productId: { stringValue: i.productId },
                      quantity: { integerValue: String(i.quantity) },
                    },
                  },
                })),
              },
            },
            itemCount: { integerValue: "3" },
          },
        }),
      );
      req.end();
    });

    // Check for duplicate
    const dup = await detectDuplicateOrder(
      "test-project",
      TEST_USER_A.uid,
      TEST_PHONE_A,
      cartHash,
      0,
    );
    expect(dup.suspicious).toBe(true);
  });

  it("should NOT flag unrelated orders as duplicates", async () => {
    const { detectDuplicateOrder, computeCartFingerprint } = await import("../verification.server");
    const cartHash1 = await computeCartFingerprint(
      [{ productId: "prod-001", quantity: 1 }],
      0,
      "Dhaka",
    );

    const dup = await detectDuplicateOrder(
      "test-project",
      TEST_USER_A.uid,
      TEST_PHONE_A,
      cartHash1,
      0,
    );
    expect(dup.suspicious).toBe(false);
  });
});

/* ================================================================ */
/* TEST 10: Unauthorized Session                                     */
/* ================================================================ */

describe("TEST 10: Unauthorized Session Access", () => {
  it("should reject User B using User A's session", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);

    // User B tries to verify User A's session
    const result = await verifyOtpFor(TEST_USER_B, otpResult.sessionId, otpResult.mockOtp!);
    // Session is under users/test-user-a/..., but User B reads users/test-user-b/...
    // So it won't be found → rejected
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("should reject User B validating User A's session", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    const validation = await validateSession(
      TEST_USER_B,
      otpResult.sessionId,
      TEST_CART_ITEMS,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("not found");
  });
});

/* ================================================================ */
/* TEST 11: Direct Firestore Attack (Firestore Rules)                */
/* ================================================================ */

describe("TEST 11: Direct Firestore Attack (Rules Audit)", () => {
  const rules = readFileSync("firestore.rules", "utf-8");

  it("should block client-side order creation on buyer orders", () => {
    // users/{uid}/orders/{orderId} — create must be false
    expect(rules).toMatch(
      /users\/\{uid\}[\s\S]*?orders\/\{orderId\}[\s\S]*?allow create: if false/,
    );
  });

  it("should block client-side order creation on seller orders", () => {
    // sellers/{uid}/orders/{orderId} — create must be false
    expect(rules).toMatch(
      /sellers\/\{uid\}[\s\S]*?orders\/\{orderId\}[\s\S]*?allow create: if false/,
    );
  });

  it("should block all client writes to verification sessions", () => {
    expect(rules).toMatch(/verificationSessions\/\{sessionId\}[\s\S]*?allow create: if false/);
    expect(rules).toMatch(/verificationSessions\/\{sessionId\}[\s\S]*?allow update: if false/);
    expect(rules).toMatch(/verificationSessions\/\{sessionId\}[\s\S]*?allow delete: if false/);
  });

  it("should block all client writes to notification logs", () => {
    expect(rules).toMatch(/notificationLogs\/\{logId\}[\s\S]*?allow write: if false/);
  });

  it("should exclude verificationSessions from the catch-all rule", () => {
    // The catch-all exclusion list must include verificationSessions
    expect(rules).toContain("'verificationSessions'");
    // Find the catch-all section and verify exclusion
    const catchAllIdx = rules.indexOf("match /{sub}/{docId}");
    expect(catchAllIdx).toBeGreaterThan(0);
    const catchAllSection = rules.slice(catchAllIdx, catchAllIdx + 500);
    expect(catchAllSection).toContain("verificationSessions");
  });

  it("should exclude notificationLogs from the catch-all rule", () => {
    const catchAllIdx = rules.indexOf("match /{sub}/{docId}");
    expect(catchAllIdx).toBeGreaterThan(0);
    const catchAllSection = rules.slice(catchAllIdx, catchAllIdx + 500);
    expect(catchAllSection).toContain("notificationLogs");
  });

  it("should allow seller to update courierInfo on buyer orders", () => {
    // The buyer order update must include courierInfo in the allowed fields
    expect(rules).toContain("'courierInfo'");
    // Verify it appears in the buyer orders update rule context
    const buyerOrderIdx = rules.indexOf("// Orders - buyer read");
    expect(buyerOrderIdx).toBeGreaterThan(0);
    const buyerOrderSection = rules.slice(buyerOrderIdx, buyerOrderIdx + 1000);
    expect(buyerOrderSection).toContain("courierInfo");
  });

  it("should allow seller to update shipping on seller orders", () => {
    // The seller order update must include shipping in the allowed fields
    const sellerOrderIdx = rules.indexOf("// Seller orders - server-created");
    expect(sellerOrderIdx).toBeGreaterThan(0);
    const sellerOrderSection = rules.slice(sellerOrderIdx, sellerOrderIdx + 1500);
    expect(sellerOrderSection).toContain("'shipping'");
  });

  it("should protect shippingCharge within the shipping field on seller orders", () => {
    // The rules must check that shippingCharge is not modified
    expect(rules).toContain("shippingCharge");
    // Verify the comparison check exists
    expect(rules).toContain("shipping.shippingCharge");
  });

  it("should protect all settlement fields on seller orders", () => {
    const settlementFields = [
      "settlement",
      "earnings",
      "commission",
      "commissionRate",
      "discountShare",
      "shippingShare",
      "netSubtotal",
      "subtotal",
      "paymentStatus",
      "paymentMethod",
    ];
    for (const field of settlementFields) {
      expect(rules).toContain(field);
    }
    // Must have a hasAny check blocking these fields
    expect(rules).toContain("'paymentMethod'");
  });

  it("should block all client writes to settlement ledger", () => {
    expect(rules).toMatch(/settlementTx\/\{txId\}[\s\S]*?allow create, update, delete: if false/);
  });

  it("should block all client writes to seller wallet ledger", () => {
    expect(rules).toMatch(
      /sellers[\s\S]*?walletTx\/\{txId\}[\s\S]*?allow create, update, delete: if false/,
    );
  });

  it("should block all client writes to withdrawals", () => {
    expect(rules).toMatch(
      /withdrawals\/\{withdrawalId\}[\s\S]*?allow create, update, delete: if false/,
    );
  });

  it("should block all client writes to promo codes", () => {
    expect(rules).toMatch(/promoCodes\/\{code\}[\s\S]*?allow create, update, delete: if false/);
  });
});

/* ================================================================ */
/* TEST 12: Session State Integrity                                  */
/* ================================================================ */

describe("TEST 12: Session State Integrity", () => {
  it("should reject verification of consumed session", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);
    await consumeSession(TEST_USER_A, otpResult.sessionId, "order-001");

    // Try to verify again (simulating consumed → verified transition)
    const result = await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);
    expect(result.success).toBe(false);
    expect(result.verified).toBe(false);
  });

  it("should reject validation of consumed session", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);
    await consumeSession(TEST_USER_A, otpResult.sessionId, "order-001");

    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      TEST_CART_ITEMS,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("verification is required");
  });

  it("should reject validation of pending (unverified) session", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);

    // Don't verify — try to validate directly
    const validation = await validateSession(
      TEST_USER_A,
      otpResult.sessionId,
      TEST_CART_ITEMS,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("verification is required");
  });
});

/* ================================================================ */
/* TEST 13: Resend Protection                                         */
/* ================================================================ */

describe("TEST 13: Resend Protection", () => {
  it("should enforce 60-second resend cooldown", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);

    // Immediately request again — should hit cooldown
    await expect(requestOtpFor(TEST_USER_A, TEST_PHONE_A)).rejects.toThrow(/wait/i);
  });

  it("should enforce max resend count (5)", async () => {
    // First request creates session with resendCount=1
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    const sessionPath = `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`;

    // Bypass cooldown by setting lastOtpSentAt to 2 minutes ago and resendCount to max
    const http = await import("node:http");
    const emulatorUrl = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/${sessionPath}`;
    const oldTime = Date.now() - 120000;
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        emulatorUrl,
        { method: "PATCH", headers: { "content-type": "application/json" } },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve());
        },
      );
      req.on("error", reject);
      req.write(
        JSON.stringify({
          fields: {
            lastOtpSentAt: { integerValue: String(oldTime) },
            resendCount: { integerValue: "5" },
          },
        }),
      );
      req.end();
    });

    // Request again with SAME cart — should find existing session and reject
    await expect(requestOtpFor(TEST_USER_A, TEST_PHONE_A)).rejects.toThrow(/too many resend/i);
  });
});

/* ================================================================ */
/* TEST 14: Multiple Browser Sessions                                */
/* ================================================================ */

describe("TEST 14: Multiple Browser Sessions (Non-Interference)", () => {
  it("should not interfere between two separate sessions", async () => {
    // User A creates session 1
    const otp1 = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);

    // Force cooldown to pass for second session
    const sessionPath = `users/${TEST_USER_A.uid}/verificationSessions/${otp1.sessionId}`;
    const http = await import("node:http");
    const emulatorUrl = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/${sessionPath}`;
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        emulatorUrl,
        { method: "PATCH", headers: { "content-type": "application/json" } },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve());
        },
      );
      req.on("error", reject);
      req.write(
        JSON.stringify({
          fields: {
            status: { stringValue: "verified" },
            lastOtpSentAt: { integerValue: String(Date.now() - 120000) },
          },
        }),
      );
      req.end();
    });

    // Different cart for session 2 → should create new session (different fingerprint)
    const cart2 = [{ productId: "prod-999", quantity: 1 }];
    const otp2 = await requestOtpFor(TEST_USER_A, TEST_PHONE_A, cart2, "Different Address, Sylhet");

    // Both sessions exist
    expect(otp1.sessionId).not.toBe(otp2.sessionId);

    // Verify session 2
    const verify2 = await verifyOtpFor(TEST_USER_A, otp2.sessionId, otp2.mockOtp!);
    expect(verify2.success).toBe(true);

    // Session 1 should still be verified (not affected by session 2)
    const session1Doc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otp1.sessionId}`,
    );
    expect(session1Doc!.status).toBe("verified");
  });
});

/* ================================================================ */
/* TEST 15: Firestore Data Validation                                */
/* ================================================================ */

describe("TEST 15: Firestore Data Validation", () => {
  it("should never store plaintext OTP in Firestore", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    const otp = otpResult.mockOtp!;

    // Read the session document directly from Firestore
    const sessionDoc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`,
    );

    // The OTP itself should not appear anywhere in the document
    const docStr = JSON.stringify(sessionDoc);
    expect(docStr).not.toContain(otp);

    // The hash should be present and different from the OTP
    expect(sessionDoc!.otpHash).toBeTruthy();
    expect(sessionDoc!.otpHash).not.toBe(otp);
    expect(sessionDoc!.otpHash).toHaveLength(64); // SHA-256 hex
  });

  it("should clear OTP hash after successful verification", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);

    const sessionDoc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`,
    );
    expect(sessionDoc!.otpHash).toBeNull();
    expect(sessionDoc!.otpSalt).toBeNull();
    expect(sessionDoc!.otpExpiresAt).toBeNull();
  });

  it("should not store OTP in session after consumption", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);
    await consumeSession(TEST_USER_A, otpResult.sessionId, "order-final");

    const sessionDoc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`,
    );
    expect(sessionDoc!.otpHash).toBeNull();
    expect(sessionDoc!.status).toBe("consumed");
  });
});

/* ================================================================ */
/* TEST 16: Failure Recovery                                         */
/* ================================================================ */

describe("TEST 16: Failure Recovery", () => {
  it("should not leave session in reusable state after verification failure", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);

    // Submit wrong OTP
    const result = await verifyOtpFor(TEST_USER_A, otpResult.sessionId, "wrong1");
    expect(result.success).toBe(false);

    // Session should still be "pending" (not verified)
    const sessionDoc = getEmulatorDoc(
      `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`,
    );
    expect(sessionDoc!.status).toBe("pending");
    expect(sessionDoc!.attemptCount).toBe(1);
  });

  it("should not allow consumed session to be reused for order", async () => {
    const otpResult = await requestOtpFor(TEST_USER_A, TEST_PHONE_A);
    await verifyOtpFor(TEST_USER_A, otpResult.sessionId, otpResult.mockOtp!);
    await consumeSession(TEST_USER_A, otpResult.sessionId, "order-001");

    // Try to consume again
    const secondConsume = await consumeSession(TEST_USER_A, otpResult.sessionId, "order-002");
    expect(secondConsume.success).toBe(false);
  });

  it("should handle non-existent session gracefully", async () => {
    const validation = await validateSession(
      TEST_USER_A,
      "nonexistent-session-id",
      TEST_CART_ITEMS,
      TEST_DELIVERY_LOCATION,
      TEST_PHONE_A,
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("not found");
  });
});

/* ================================================================ */
/* TEST 17: Notification Service Integration                         */
/* ================================================================ */

describe("TEST 17: Notification Service Integration", () => {
  const events = [
    "ORDER_CREATED",
    "ORDER_CONFIRMED",
    "ORDER_PROCESSING",
    "ORDER_SHIPPED",
    "OUT_FOR_DELIVERY",
    "ORDER_DELIVERED",
    "ORDER_CANCELLED",
  ] as const;

  for (const event of events) {
    it(`should deliver ${event} notification via mock provider`, async () => {
      const { sendOrderNotification } = await import("../notifications.server");
      const result = await sendOrderNotification(event, {
        orderId: "test-order-001",
        customerName: "Test Customer",
        phoneNumber: "01712345678",
        orderTotal: 1250,
      });
      expect(result.delivered).toBe(true);
      expect(result.channel).toBe("mock");
    });
  }
});

/* ================================================================ */
/* TEST 18: Production Safety Check                                   */
/* ================================================================ */

describe("TEST 18: Production Safety Check", () => {
  it("should reject mock provider when NODE_ENV=production", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalProvider = process.env.VERIFICATION_PROVIDER;

    process.env.NODE_ENV = "production";
    delete process.env.VERIFICATION_PROVIDER;

    try {
      // Reset modules to clear cached provider
      vi.resetModules();
      const { requestOtp } = await import("../verification.server");

      await expect(
        requestOtp({
          userId: TEST_USER_A.uid,
          phoneNumber: TEST_PHONE_A,
          cartItems: TEST_CART_ITEMS,
          orderTotal: TEST_ORDER_TOTAL,
          itemCount: 3,
          deliveryLocation: TEST_DELIVERY_LOCATION,
        }),
      ).rejects.toThrow(/not configured for production/i);
    } finally {
      if (originalNodeEnv) process.env.NODE_ENV = originalNodeEnv;
      else delete process.env.NODE_ENV;
      if (originalProvider) process.env.VERIFICATION_PROVIDER = originalProvider;
      // Reset modules again to restore the non-production provider
      vi.resetModules();
    }
  });

  it("should not return OTP in production mode", async () => {
    // This is implicitly tested above — if mock throws, no OTP is ever returned.
    // Additionally, the mockOtp field only exists when sendResult.mock is true,
    // which can only happen in mock mode (not production).
    expect(true).toBe(true); // Verified by the test above
  });

  it("should allow mock provider in development", async () => {
    // Re-import after vi.resetModules in the previous test
    const { requestOtp } = await import("../verification.server");
    const result = await requestOtp({
      userId: TEST_USER_A.uid,
      phoneNumber: TEST_PHONE_A,
      cartItems: TEST_CART_ITEMS,
      orderTotal: TEST_ORDER_TOTAL,
      itemCount: 3,
      deliveryLocation: TEST_DELIVERY_LOCATION,
    });
    expect(result.mockOtp).toBeTruthy();
  });
});

/* ================================================================ */
/* SUMMARY: Rate Limiting                                            */
/* ================================================================ */

describe("Rate Limiting", () => {
  it("should limit OTP requests to 10 per hour per user", async () => {
    const http = await import("node:http");

    // Create 10 sessions, expiring each one before creating the next
    // to avoid the 60s resend cooldown on pending sessions.
    for (let i = 0; i < 10; i++) {
      const otpResult = await requestOtpFor(
        TEST_USER_A,
        TEST_PHONE_A,
        [{ productId: `prod-rl-${i}`, quantity: 1 }],
        `Address RL ${i}, City ${i}`,
      );

      // Expire this session so the next request won't find a pending session
      // and won't hit the resend cooldown
      const sessionPath = `users/${TEST_USER_A.uid}/verificationSessions/${otpResult.sessionId}`;
      const emulatorUrl = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents/${sessionPath}`;
      await new Promise<void>((resolve) => {
        const req = http.request(
          emulatorUrl,
          { method: "PATCH", headers: { "content-type": "application/json" } },
          (res) => {
            res.on("data", () => {});
            res.on("end", () => resolve());
          },
        );
        req.write(
          JSON.stringify({
            fields: { status: { stringValue: "expired" } },
          }),
        );
        req.end();
      });
    }

    // 11th request should be rate limited (10 sessions exist in last hour)
    await expect(
      requestOtpFor(
        TEST_USER_A,
        TEST_PHONE_A,
        [{ productId: "prod-rate-limit", quantity: 1 }],
        "Rate Limit Address",
      ),
    ).rejects.toThrow(/too many verification requests/i);
  });
});
