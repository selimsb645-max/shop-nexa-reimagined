/**
 * Admin coupon transport — static audit.
 *
 * The rules deny client SDK writes on coupons for EVERY role, so the
 * admin service must be a pure transport client and the transport
 * must role-verify every call before touching the admin core.
 */
import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as typeof import("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path") as typeof import("path");

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf-8");

/** Strip line comments — audit the CODE, not the prose. */
const stripComments = (code: string) =>
  code
    .split("\n")
    .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
    .join("\n");

describe("admin coupon transport", () => {
  const service = stripComments(read("src/services/firebase/adminCoupons.ts"));
  const transport = stripComments(read("src/lib/coupons/coupon-admin.functions.ts"));

  it("the admin service NEVER writes via the client SDK", () => {
    expect(service).not.toMatch(/setDoc|updateDoc|deleteDoc|addDoc|getDocs|getDoc/);
    expect(service).toContain("coupon-admin.functions");
    expect(service).toContain("requireIdToken()");
  });

  it("every transport call role-verifies via verifyCouponAdmin + verifyIdToken", () => {
    expect(transport).toContain("verifyIdToken");
    const verifyCount = (transport.match(/verifyCouponAdmin\(/g) ?? []).length;
    const fnCount = (transport.match(/createServerFn\(/g) ?? []).length;
    expect(fnCount).toBeGreaterThan(0);
    expect(verifyCount).toBe(fnCount);
  });

  it("upsert is create-or-masked-patch (never a whole-doc overwrite)", () => {
    // The legacy setDoc() overwrite wiped sellerId/productIds/maxDiscount
    // on every admin edit — the transport must use createCoupon +
    // updateCoupon (masked patch) instead.
    expect(transport).not.toContain("setDoc");
    expect(transport).toContain("createCoupon");
    expect(transport).toContain("updateCoupon");
  });

  it("delete goes through the redemption-guarded core", () => {
    expect(transport).toContain("deleteCoupon(projectId, data.code");
  });
});
