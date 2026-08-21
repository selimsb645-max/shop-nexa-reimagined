/**
 * Tests for Shop Nexa Transactional Email Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  renderEmailTemplate,
  type OrderEmailData,
  type WithdrawalEmailData,
} from "../email-templates.server";
import {
  sendTransactionalEmail,
  makeIdempotencyKey,
  sendOrderEmail,
  sendPasswordResetEmail,
  sendWithdrawalEmail,
  _resetEmailProvider,
  _clearSentKeys,
  type EmailEvent,
} from "../email.server";

const mockOrder: OrderEmailData = {
  orderId: "order_abc123def456",
  customerName: "Rahim Ahmed",
  orderDate: "2026-08-21T10:00:00Z",
  status: "confirmed",
  items: [
    {
      name: "Wireless Headphones",
      quantity: 2,
      price: 850,
      image: "https://shopnexa.app/img/hp.jpg",
    },
    { name: "Phone Case", quantity: 1, price: 250, image: "https://shopnexa.app/img/case.jpg" },
  ],
  subtotal: 1950,
  discount: 200,
  deliveryFee: 60,
  grandTotal: 1810,
  deliveryAddress: {
    fullName: "Rahim Ahmed",
    addressLine: "House 12, Road 5",
    city: "Dhaka",
    postalCode: "1212",
    phone: "01712345678",
  },
};

const mockWithdrawal: WithdrawalEmailData = {
  sellerName: "Karim Store",
  withdrawalId: "wdl_xyz789abc012",
  amount: 15000,
  requestDate: "2026-08-21T12:00:00Z",
  status: "requested",
  paymentMethod: "Bank Transfer \u2014 ****1234",
};

/* TEST 1-4: Order Emails */
describe("Order Emails", () => {
  it("TEST 1: Order confirmation email (ORDER_CREATED)", () => {
    const result = renderEmailTemplate("ORDER_CREATED", { order: mockOrder });
    expect(result.subject).toContain("Shop Nexa");
    expect(result.subject).toContain("order_ab");
    expect(result.subject).toContain("Confirmed");
    expect(result.html).toContain("Order Confirmed!");
    expect(result.html).toContain("Rahim Ahmed");
    expect(result.html).toContain("Wireless Headphones");
    expect(result.html).toContain("Phone Case");
    expect(result.html).toContain("Subtotal");
    expect(result.html).toContain("Discount");
    expect(result.html).toContain("Grand Total");
    expect(result.html).toContain("1,810");
    expect(result.html).toContain("House 12, Road 5");
    expect(result.html).toContain("View Order");
    expect(result.html).toContain("/orders/order_abc123def456");
  });

  it("TEST 2: Order shipped email (ORDER_SHIPPED)", () => {
    const result = renderEmailTemplate("ORDER_SHIPPED", { order: mockOrder });
    expect(result.subject).toContain("Shipped");
    expect(result.html).toContain("shipped");
    expect(result.html).toContain("View Order");
    expect(result.html).toContain("House 12, Road 5");
  });

  it("TEST 3: Order delivered email (ORDER_DELIVERED)", () => {
    const result = renderEmailTemplate("ORDER_DELIVERED", { order: mockOrder });
    expect(result.subject).toContain("Delivered");
    expect(result.html).toContain("delivered");
    expect(result.html).toContain("Thank you for shopping with Shop Nexa");
  });

  it("TEST 4: Order cancelled email (ORDER_CANCELLED)", () => {
    const result = renderEmailTemplate("ORDER_CANCELLED", { order: mockOrder });
    expect(result.subject.toLowerCase()).toContain("cancelled");
    expect(result.html).toContain("cancelled");
    expect(result.html).toContain("did not request this cancellation");
  });

  it("TEST: Order processing email (ORDER_PROCESSING)", () => {
    const result = renderEmailTemplate("ORDER_PROCESSING", { order: mockOrder });
    expect(result.subject).toContain("Processing");
    expect(result.html).toContain("being processed");
  });

  it("TEST: Out for delivery email (OUT_FOR_DELIVERY)", () => {
    const result = renderEmailTemplate("OUT_FOR_DELIVERY", { order: mockOrder });
    expect(result.html).toContain("out for delivery");
    expect(result.html).toContain("keep your phone");
  });

  it("TEST: Order confirmed email (ORDER_CONFIRMED)", () => {
    const result = renderEmailTemplate("ORDER_CONFIRMED", { order: mockOrder });
    expect(result.html).toContain("confirmed");
  });

  it("Contradictory status: cancelled shows cancelled, not shipped", () => {
    const cancelled = renderEmailTemplate("ORDER_CANCELLED", { order: mockOrder });
    const shipped = renderEmailTemplate("ORDER_SHIPPED", { order: mockOrder });
    expect(cancelled.html).toContain("cancelled");
    expect(cancelled.html).not.toContain("has been shipped");
    expect(shipped.html).toContain("shipped");
    expect(shipped.html).not.toContain("cancelled");
  });
});

/* TEST 5: Password Reset Email */
describe("Password Reset Email", () => {
  it("TEST 5: renders correct subject and button", () => {
    const result = renderEmailTemplate("PASSWORD_RESET", {
      recipientName: "Rahim",
      resetLink: "https://shopnexa.app/reset-password?oobCode=abc123",
    });
    expect(result.subject).toContain("Reset Your Password");
    expect(result.html).toContain("Reset Password");
    expect(result.html).toContain("https://shopnexa.app/reset-password?oobCode=abc123");
    expect(result.html).toContain("safely ignore this email");
  });

  it("should NOT include any password text", () => {
    const result = renderEmailTemplate("PASSWORD_RESET", {
      recipientName: "Rahim",
      resetLink: "https://shopnexa.app/reset-password?oobCode=abc123",
    });
    const lower = result.html.toLowerCase();
    expect(lower).not.toMatch(/your password is/i);
    expect(lower).not.toMatch(/new password:\s*\w+/i);
  });

  it("subject should NOT contain oobCode or secrets", () => {
    const result = renderEmailTemplate("PASSWORD_RESET", {
      recipientName: "Test",
      resetLink: "https://shopnexa.app/reset?oobCode=secret123",
    });
    expect(result.subject).not.toContain("secret123");
    expect(result.subject.toLowerCase()).not.toContain("oobCode");
  });
});

/* TEST 6-9: Seller Withdrawal Emails */
describe("Seller Withdrawal Emails", () => {
  it("TEST 6: WITHDRAWAL_REQUESTED", () => {
    const result = renderEmailTemplate("WITHDRAWAL_REQUESTED", { withdrawal: mockWithdrawal });
    expect(result.subject).toContain("Withdrawal");
    expect(result.subject).toContain("Requested");
    expect(result.html).toContain("Karim Store");
    expect(result.html).toContain("15,000");
    expect(result.html).toContain("Bank Transfer");
    expect(result.html).toContain("requested");
    expect(result.html).toContain("View Dashboard");
    expect(result.html).toContain("/seller/dashboard");
    expect(result.html).toContain("Never share your bank details");
  });

  it("TEST 7: WITHDRAWAL_APPROVED", () => {
    const result = renderEmailTemplate("WITHDRAWAL_APPROVED", { withdrawal: mockWithdrawal });
    expect(result.subject).toContain("Approved");
    expect(result.html).toContain("approved");
    expect(result.html).toContain("Payment is being initiated");
  });

  it("TEST 8: WITHDRAWAL_REJECTED with reason", () => {
    const result = renderEmailTemplate("WITHDRAWAL_REJECTED", {
      withdrawal: { ...mockWithdrawal, reason: "Insufficient balance" },
    });
    expect(result.subject).toContain("Rejected");
    expect(result.html).toContain("rejected");
    expect(result.html).toContain("Insufficient balance");
  });

  it("TEST 9: WITHDRAWAL_COMPLETED", () => {
    const result = renderEmailTemplate("WITHDRAWAL_COMPLETED", { withdrawal: mockWithdrawal });
    expect(result.subject).toContain("Completed");
    expect(result.html).toContain("completed");
    expect(result.html).toContain("funds have been transferred");
  });

  it("should mask payment method (no full account numbers)", () => {
    const result = renderEmailTemplate("WITHDRAWAL_REQUESTED", {
      withdrawal: { ...mockWithdrawal, paymentMethod: "Bank Transfer \u2014 ****1234" },
    });
    expect(result.html).toContain("****1234");
    expect(result.html).not.toMatch(/\d{16}/);
  });
});

/* TEST 10-13: Provider Adapters & Selection */
describe("Email Provider Architecture", () => {
  beforeEach(() => {
    _resetEmailProvider();
    _clearSentKeys();
    vi.stubEnv("EMAIL_PROVIDER", "mock");
  });
  afterEach(() => {
    _resetEmailProvider();
    vi.unstubAllEnvs();
  });

  it("TEST 10: Mock provider should succeed", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "mock");
    _resetEmailProvider();
    const result = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "test@example.com",
      data: { order: mockOrder },
      entityId: mockOrder.orderId,
    });
    expect(result.delivered).toBe(true);
    expect(result.provider).toBe("mock");
  });

  it("TEST 11: Resend provider should fail gracefully without API key", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    _resetEmailProvider();
    const result = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "test@example.com",
      data: { order: mockOrder },
      entityId: mockOrder.orderId,
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("RESEND_API_KEY");
  });

  it("TEST 12: SendGrid provider should fail gracefully without API key", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "sendgrid");
    vi.stubEnv("SENDGRID_API_KEY", "");
    _resetEmailProvider();
    const result = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "test@example.com",
      data: { order: mockOrder },
      entityId: mockOrder.orderId,
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("SENDGRID_API_KEY");
  });

  it("TEST 13: Unknown provider should fall back to mock", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "nonexistent");
    _resetEmailProvider();
    const result = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "test@example.com",
      data: { order: mockOrder },
      entityId: mockOrder.orderId,
    });
    expect(result.delivered).toBe(true);
    expect(result.provider).toBe("mock");
  });

  it("TEST 13b: Empty provider config should default to mock", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    _resetEmailProvider();
    const result = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "test@example.com",
      data: { order: mockOrder },
      entityId: mockOrder.orderId,
    });
    expect(result.delivered).toBe(true);
    expect(result.provider).toBe("mock");
  });
});

/* TEST 15: Duplicate Email Prevention */
describe("Email Idempotency", () => {
  beforeEach(() => {
    _resetEmailProvider();
    _clearSentKeys();
    vi.stubEnv("EMAIL_PROVIDER", "mock");
  });
  afterEach(() => {
    _resetEmailProvider();
    vi.unstubAllEnvs();
  });

  it("TEST 15: Should suppress duplicate emails for same event+entity", async () => {
    const params = {
      event: "ORDER_CREATED" as EmailEvent,
      recipient: "dup@example.com",
      data: { order: mockOrder } as const,
      entityId: mockOrder.orderId,
    };
    const r1 = await sendTransactionalEmail(params);
    expect(r1.delivered).toBe(true);
    const r2 = await sendTransactionalEmail(params);
    expect(r2.delivered).toBe(true);
    expect(r2.error).toBe("duplicate_suppressed");
  });

  it("Should NOT suppress emails for different events on same entity", async () => {
    const r1 = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "multi@example.com",
      data: { order: mockOrder },
      entityId: mockOrder.orderId,
    });
    expect(r1.delivered).toBe(true);
    const r2 = await sendTransactionalEmail({
      event: "ORDER_SHIPPED",
      recipient: "multi@example.com",
      data: { order: mockOrder },
      entityId: mockOrder.orderId,
    });
    expect(r2.delivered).toBe(true);
    expect(r2.error).not.toBe("duplicate_suppressed");
  });

  it("Should NOT suppress emails for same event on different entities", async () => {
    const r1 = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "a@example.com",
      data: { order: mockOrder },
      entityId: "order_AAA",
    });
    expect(r1.delivered).toBe(true);
    const r2 = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "b@example.com",
      data: { order: mockOrder },
      entityId: "order_BBB",
    });
    expect(r2.delivered).toBe(true);
    expect(r2.error).not.toBe("duplicate_suppressed");
  });

  it("makeIdempotencyKey should produce consistent keys", () => {
    const k1 = makeIdempotencyKey("ORDER_CREATED", "test@example.com", "order_123");
    const k2 = makeIdempotencyKey("ORDER_CREATED", "test@example.com", "order_123");
    const k3 = makeIdempotencyKey("ORDER_SHIPPED", "test@example.com", "order_123");
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});

/* TEST 16: Email Failure Handling */
describe("Email Failure Handling", () => {
  beforeEach(() => {
    _resetEmailProvider();
    _clearSentKeys();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
  });
  afterEach(() => {
    _resetEmailProvider();
    vi.unstubAllEnvs();
  });

  it("TEST 16: Email failure should return error, not throw", async () => {
    const result = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "fail@example.com",
      data: { order: mockOrder },
      entityId: mockOrder.orderId,
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("Missing order data should return template_error, not throw", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "mock");
    _resetEmailProvider();
    const result = await sendTransactionalEmail({
      event: "ORDER_CREATED",
      recipient: "noData@example.com",
      data: {},
      entityId: "order_none",
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toBe("template_error");
  });
});

/* TEST 17: SITE_URL Correctness */
describe("SITE_URL Configuration", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "https://custom-domain.com");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("TEST 17: Order links should use SITE_URL", () => {
    const result = renderEmailTemplate("ORDER_CREATED", { order: mockOrder });
    expect(result.html).toContain("https://custom-domain.com/orders/");
  });

  it("Withdrawal dashboard links should use SITE_URL", () => {
    const result = renderEmailTemplate("WITHDRAWAL_REQUESTED", { withdrawal: mockWithdrawal });
    expect(result.html).toContain("https://custom-domain.com/seller/dashboard");
  });

  it("Help center link should use SITE_URL", () => {
    const result = renderEmailTemplate("ORDER_CREATED", { order: mockOrder });
    expect(result.html).toContain("https://custom-domain.com/help-center");
  });

  it("Should NOT contain localhost in links", () => {
    const result = renderEmailTemplate("ORDER_CREATED", { order: mockOrder });
    expect(result.html).not.toContain("localhost");
  });
});

/* TEST 18: Sensitive Data Leakage Prevention */
describe("Sensitive Data Leakage Prevention", () => {
  it("TEST 18a: Order subject should use short ID, not full internal ID", () => {
    const result = renderEmailTemplate("ORDER_CREATED", { order: mockOrder });
    expect(result.subject).toContain("order_ab");
    expect(result.subject).not.toContain("order_abc123def456"); // full ID not in subject
  });

  it("TEST 18b: Password reset email should NOT contain any password", () => {
    const result = renderEmailTemplate("PASSWORD_RESET", {
      recipientName: "Test",
      resetLink: "https://shopnexa.app/reset?code=xyz",
    });
    const lower = result.html.toLowerCase();
    expect(lower).not.toMatch(/password:\s*\S+/i);
    expect(lower).not.toMatch(/your (current|new|old) password is/i);
  });

  it("TEST 18c: Withdrawal email should NOT expose full bank credentials", () => {
    const result = renderEmailTemplate("WITHDRAWAL_REQUESTED", {
      withdrawal: { ...mockWithdrawal, paymentMethod: "Bank Transfer \u2014 ****1234" },
    });
    expect(result.html).not.toMatch(/\d{16,}/);
    expect(result.html).not.toMatch(/account\s*number:\s*\d+/i);
  });

  it("TEST 18d: No email should contain API keys or auth tokens", () => {
    const events: EmailEvent[] = [
      "ORDER_CREATED",
      "ORDER_CONFIRMED",
      "ORDER_PROCESSING",
      "ORDER_SHIPPED",
      "OUT_FOR_DELIVERY",
      "ORDER_DELIVERED",
      "ORDER_CANCELLED",
      "PASSWORD_RESET",
      "WITHDRAWAL_REQUESTED",
      "WITHDRAWAL_APPROVED",
      "WITHDRAWAL_REJECTED",
      "WITHDRAWAL_COMPLETED",
    ];
    for (const event of events) {
      const data =
        event === "PASSWORD_RESET"
          ? { recipientName: "Test", resetLink: "https://shopnexa.app/reset" }
          : event.startsWith("WITHDRAWAL")
            ? { withdrawal: mockWithdrawal }
            : { order: mockOrder };
      const result = renderEmailTemplate(event, data);
      const lower = result.html.toLowerCase();
      expect(lower).not.toMatch(/api[_-]?key/i);
      expect(lower).not.toMatch(/bearer\s+/i);
      expect(lower).not.toMatch(/secret\s*:\s*\S+/i);
      expect(lower).not.toMatch(/token\s*:\s*\S+/i);
    }
  });
});

/* HTML Quality */
describe("Email HTML Quality", () => {
  it("should include viewport meta tag for mobile", () => {
    const result = renderEmailTemplate("ORDER_CREATED", { order: mockOrder });
    expect(result.html).toContain("viewport");
    expect(result.html).toContain("width=device-width");
  });

  it("should use table-based layout, no scripts", () => {
    const result = renderEmailTemplate("ORDER_CREATED", { order: mockOrder });
    expect(result.html).toContain('role="presentation"');
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("<iframe");
  });

  it("should include Shop Nexa branding", () => {
    const result = renderEmailTemplate("ORDER_CREATED", { order: mockOrder });
    expect(result.html).toContain("Shop Nexa");
    expect(result.html).toContain("#f97316");
  });

  it("should include footer with copyright", () => {
    const result = renderEmailTemplate("ORDER_CREATED", { order: mockOrder });
    expect(result.html).toContain("\u00A9");
    expect(result.html).toContain("All rights reserved");
  });
});

/* Convenience Wrappers */
describe("Convenience Wrappers", () => {
  beforeEach(() => {
    _resetEmailProvider();
    _clearSentKeys();
    vi.stubEnv("EMAIL_PROVIDER", "mock");
  });
  afterEach(() => {
    _resetEmailProvider();
    vi.unstubAllEnvs();
  });

  it("sendOrderEmail works", async () => {
    const result = await sendOrderEmail("ORDER_CREATED", "wrap@example.com", mockOrder);
    expect(result.delivered).toBe(true);
  });

  it("sendPasswordResetEmail works", async () => {
    const result = await sendPasswordResetEmail(
      "reset@example.com",
      "Test User",
      "https://shopnexa.app/reset?code=abc",
    );
    expect(result.delivered).toBe(true);
  });

  it("sendWithdrawalEmail works", async () => {
    const result = await sendWithdrawalEmail(
      "WITHDRAWAL_REQUESTED",
      "seller@example.com",
      mockWithdrawal,
    );
    expect(result.delivered).toBe(true);
  });
});

/* Source Code Security Audit */
describe("Source Code Security Audit", () => {
  it("should NOT find hard-coded API keys in email source files", () => {
    const files = ["src/lib/email.server.ts", "src/lib/email-templates.server.ts"];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      expect(content).not.toMatch(/(?:resend|sendgrid)_[a-z0-9]{20,}/i);
      expect(content).toContain("env.get");
    }
  });

  it("should NOT import email server module in client-side files", () => {
    const clientFiles = ["src/routes/_authenticated/checkout.tsx", "src/services/firebase/auth.ts"];
    for (const file of clientFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content).not.toContain('from "@/lib/email.server"');
      expect(content).not.toContain('from "@/lib/email-templates.server"');
    }
  });
});
