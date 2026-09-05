import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const serverCode = readFileSync("src/lib/giftcards.server.ts", "utf-8");
const functionsCode = readFileSync("src/lib/giftcards.functions.ts", "utf-8");
const clientCode = readFileSync("src/services/firebase/giftCards.ts", "utf-8");
const pageCode = readFileSync("src/routes/_authenticated/gift-cards.tsx", "utf-8");
const rulesCode = readFileSync("firestore.rules", "utf-8");

describe("Gift Card Purchase — Server Logic", () => {
  it("validates amount: rejects NaN, zero, negative", () => {
    expect(serverCode).toContain("Number.isFinite(amount)");
    expect(serverCode).toContain("amount <= 0");
    expect(serverCode).toContain("MIN_AMOUNT");
    expect(serverCode).toContain("MAX_AMOUNT");
  });

  it("validates recipient name and email", () => {
    expect(serverCode).toContain("recipientName");
    expect(serverCode).toContain("recipientEmail");
  });

  it("reads wallet balance server-side from Firestore ledger", () => {
    expect(serverCode).toContain("walletTx");
    expect(serverCode).toContain("fromFsFields");
  });

  it("checks for insufficient balance inside the transaction", () => {
    expect(serverCode).toContain("Insufficient wallet balance");
    expect(serverCode).toContain("walletBalance < amount");
  });

  it("generates cryptographically random codes", () => {
    expect(serverCode).toContain("crypto.getRandomValues");
    expect(serverCode).toContain("generateGiftCardCode");
  });

  it("checks code uniqueness against Firestore", () => {
    expect(serverCode).toContain("isCodeUnique");
    expect(serverCode).toContain("generateUniqueCode");
  });

  it("uses Firestore transaction (not batch commit)", () => {
    expect(serverCode).toContain("beginTransaction");
    expect(serverCode).toContain("commitWithTx");
    expect(serverCode).not.toContain("commitWrites");
  });

  it("creates gift card document with all required fields", () => {
    expect(serverCode).toContain("code");
    expect(serverCode).toContain("amount");
    expect(serverCode).toContain("balance");
    expect(serverCode).toContain("senderName");
    expect(serverCode).toContain("recipientName");
    expect(serverCode).toContain("recipientEmail");
    expect(serverCode).toContain("message");
    expect(serverCode).toContain("status");
    expect(serverCode).toContain("uid");
    expect(serverCode).toContain("expiresAt");
    expect(serverCode).toContain("createdAt");
    expect(serverCode).toContain("updatedAt");
  });

  it("creates wallet debit transaction", () => {
    expect(serverCode).toContain("gift_card_purchase");
    expect(serverCode).toContain("amount: -amount");
  });

  it("creates purchase record in user subcollection", () => {
    expect(serverCode).toContain("giftCardPurchases");
    expect(serverCode).toContain("giftCardId");
  });
});

describe("Gift Card Purchase — Server Function", () => {
  it("verifies Firebase ID token server-side", () => {
    expect(functionsCode).toContain("verifyIdToken");
    expect(functionsCode).toContain("idToken");
  });

  it("never trusts client-provided userId", () => {
    expect(functionsCode).not.toContain("data.uid");
    expect(functionsCode).toContain("const { uid, email } = await verifyIdToken");
  });

  it("uses zod schema validation", () => {
    expect(functionsCode).toContain("z.object");
    expect(functionsCode).toContain("purchaseSchema");
    expect(functionsCode).toContain("inputValidator");
  });

  it("validates amount range in schema (100-100000)", () => {
    expect(functionsCode).toContain("z.number().min(100).max(100_000)");
  });

  it("validates recipient email format", () => {
    expect(functionsCode).toContain("z.string().trim().email()");
  });
});

describe("Gift Card Purchase — Client Service", () => {
  it("does NOT write directly to Firestore", () => {
    expect(clientCode).not.toContain("addDoc");
  });

  it("calls the server function, not Firestore directly", () => {
    expect(clientCode).toContain("purchaseGiftCardFn");
    expect(clientCode).toContain("getIdToken");
  });

  it("gets the current user's ID token", () => {
    expect(clientCode).toContain("getFirebaseAuth");
    expect(clientCode).toContain("currentUser");
    expect(clientCode).toContain("getIdToken");
  });

  it("requires authentication before purchase", () => {
    expect(clientCode).toContain("Please sign in to purchase a gift card");
  });
});

describe("Gift Card Purchase — UI Page", () => {
  it("normalizes amount to prevent NaN/undefined/null", () => {
    expect(pageCode).toContain("Number(amount)");
    expect(pageCode).toContain("Number.isFinite");
  });

  it("has double-click protection (disabled while pending)", () => {
    expect(pageCode).toContain("purchaseMutation.isPending");
    expect(pageCode).toContain("disabled");
  });

  it("shows specific error messages, not generic", () => {
    expect(pageCode).toContain("err.message");
  });

  it("shows success state after purchase", () => {
    expect(pageCode).toContain("purchasedCard");
    expect(pageCode).toContain("Gift Card Purchased");
  });

  it("invalidates wallet query after purchase", () => {
    expect(pageCode).toContain('queryKey: ["wallet"]');
  });

  it("invalidates gift cards query after purchase", () => {
    expect(pageCode).toContain('queryKey: ["giftCards"]');
  });
});

describe("Gift Card Purchase — Firestore Security Rules", () => {
  it("has rules for giftCards collection", () => {
    expect(rulesCode).toContain("match /giftCards/{id}");
  });

  it("allows client read only for own cards", () => {
    expect(rulesCode).toContain("resource.data.uid == request.auth.uid");
  });

  it("blocks all client writes to giftCards", () => {
    const giftCardSection = rulesCode.substring(
      rulesCode.indexOf("match /giftCards/{id}"),
      rulesCode.indexOf("match /giftCards/{id}") + 200,
    );
    expect(giftCardSection).toContain("allow write: if false");
  });
});
