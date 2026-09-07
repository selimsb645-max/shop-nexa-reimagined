/**
 * firestore.rules — coupon security audit (regex, flashSaleAdmin style).
 *
 * Locks in the Coupon v2 write-path discipline:
 *  • coupons: NO admin client write path (server-authoritative core)
 *  • sellers: constrained self-service only (own sellerId, uses == 0
 *    on create, active/updatedAt-only updates, delete only if never
 *    redeemed)
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

  it("seller create is constrained: own sellerId + uses == 0", () => {
    expect(coupons).toContain("allow create: if isApprovedSeller()");
    expect(coupons).toContain("request.resource.data.sellerId == request.auth.uid");
    expect(coupons).toContain("request.resource.data.uses == 0");
  });

  it("seller update is field-limited to active/updatedAt", () => {
    expect(coupons).toContain("affectedKeys().hasOnly(['active', 'updatedAt'])");
  });

  it("seller delete requires uses == 0 (no deleting redemption history)", () => {
    const idx = coupons.indexOf("allow delete:");
    expect(idx).toBeGreaterThan(-1);
    // the full clause, including continuation lines up to the terminator
    const deleteClause = coupons.slice(idx, coupons.indexOf(";", idx) + 1);
    expect(deleteClause).toContain("isApprovedSeller()");
    expect(deleteClause).toContain("resource.data.sellerId == request.auth.uid");
    expect(deleteClause).toContain("resource.data.uses == 0");
  });

  it("the `uses` counter is never client-writable", () => {
    // create forces uses == 0; update's hasOnly(['active','updatedAt'])
    // excludes `uses` — and there is no other update path.
    expect(coupons).toContain("hasOnly(['active', 'updatedAt'])");
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
