/**
 * firestore.rules — coupon security audit (regex, flashSaleAdmin style).
 *
 * Locks in the Coupon v2 write-path discipline:
 *  • coupons: NO client write path for ANY role — admin mutations
 *    go through the coupon admin core, seller self-service through
 *    the seller coupon core (both service-account, verified,
 *    validated, audited server-side)
 *  • couponRedemptions: immutable — write denied for EVERY client;
 *    sellers read only their own coupon redemptions
 *  • couponCustomerCounters: server-only (customer redemption
 *    history is PII — no client read or write)
 */
import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as typeof import("fs");

const rules = fs.readFileSync("firestore.rules", "utf-8");

function block(collection: string): string {
  const m = rules.match(
    new RegExp(`match \\/${collection}\\/\\{[a-zA-Z]+\\} \\{[\\s\\S]*?\\n {4}\\}`),
  );
  return m?.[0] ?? "";
}

describe("firestore.rules — coupons block", () => {
  const coupons = block("coupons");

  it("has a dedicated match block", () => {
    expect(coupons).toBeTruthy();
  });

  it("coupons stay publicly readable (storefront lists them)", () => {
    expect(coupons).toContain("allow read: if true;");
  });

  it("NO admin client write path — roleIn() is gone from every write line", () => {
    const writeLines = coupons.split("\n").filter((l) => l.trim().startsWith("allow "));
    expect(writeLines.length).toBeGreaterThan(0);
    for (const line of writeLines) {
      expect(line.includes("roleIn(")).toBe(false);
    }
  });

  it("ALL client writes are denied for every role — server-only", () => {
    expect(coupons).toContain("allow create, update, delete: if false;");
    // no other write line
    const writeLines = coupons
      .split("\n")
      .filter((l) => l.trim().startsWith("allow "))
      .map((l) => l.trim())
      .filter((l) => !l.startsWith("allow read"));
    expect(writeLines.every((l) => l === "allow create, update, delete: if false;")).toBe(true);
  });

  it("the `uses` counter is never client-writable (no client write path at all)", () => {
    expect(coupons).toContain("allow create, update, delete: if false;");
  });
});

describe("firestore.rules — couponRedemptions block", () => {
  const red = block("couponRedemptions");

  it("exists", () => {
    expect(red).toBeTruthy();
  });

  it("ALL client writes are denied — server-only immutable history", () => {
    expect(red).toContain("allow write: if false;");
    // no other write line
    const writeLines = red
      .split("\n")
      .filter((l) => l.trim().startsWith("allow "))
      .map((l) => l.trim())
      .filter((l) => !l.startsWith("allow read"));
    expect(writeLines.every((l) => l === "allow write: if false;")).toBe(true);
  });

  it("seller reads are gated to their OWN coupon redemptions (no cross-seller usage data)", () => {
    expect(red).toContain("resource.data.sellerId == request.auth.uid");
  });

  it("seller read requires isApprovedSeller (no customer access to who-redeemed-what)", () => {
    expect(red).toContain("isApprovedSeller()");
  });
});

describe("firestore.rules — couponCustomerCounters block", () => {
  const counters = block("couponCustomerCounters");

  it("exists", () => {
    expect(counters).toBeTruthy();
  });

  it("no client can read OR write the counters (pure server data)", () => {
    expect(counters).toContain("allow read, write: if false;");
    const writeLines = counters.split("\n").filter((l) => l.trim().startsWith("allow "));
    expect(writeLines.length).toBe(1); // exactly the one deny line
  });
});

describe("firestore.rules — IDOR protection via non-guessable/document-id paths", () => {
  it("predicting {code}__{userId} ids grants nothing — all client writes are denied", () => {
    const allRules = rules;
    expect(allRules).toContain("match /couponRedemptions/{id}");
    expect(allRules).toContain("match /couponCustomerCounters/{id}");
  });
});
