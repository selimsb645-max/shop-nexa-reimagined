/**
 * AVENTA SHOP — Prompt 04 §12 TESTS: Money representation & precision.
 *
 * Floating point must NEVER be used in financial calculations — every
 * test here locks that guarantee in.
 */

import { describe, it, expect } from "vitest";
import {
  toMinor, fromMinor, addMoney, subMoney, mulBps, rateToBps,
  assertMoney, formatMoney, type Money,
} from "../money";

describe("money: minor-unit representation (§3, §12 amount precision)", () => {
  it("৳100.50 → 10050 paisa (the exact example from the spec)", () => {
    expect(toMinor(100.5).amountMinor).toBe(10050);
    expect(toMinor(100.5).currency).toBe("BDT");
  });

  it("integer minor units — no float dust anywhere", () => {
    // Classic float traps, all must resolve to exact integers:
    for (const taka of [0.1, 0.07, 19.99, 123456.78, 0.005, 99.995]) {
      const m = toMinor(taka);
      expect(Number.isSafeInteger(m.amountMinor)).toBe(true);
    }
    expect(toMinor(0.1).amountMinor + toMinor(0.2).amountMinor).toBe(30); // 0.1+0.2 float trap
  });

  it("rounds half-up exactly once at the boundary", () => {
    expect(toMinor(1.005).amountMinor).toBe(101); // rounds to ৳1.01
    expect(toMinor(2.344).amountMinor).toBe(234);
    expect(toMinor(2.345).amountMinor).toBe(235);
  });

  it("rejects non-finite values and unsafe amounts", () => {
    expect(() => toMinor(Number.NaN)).toThrow();
    expect(() => toMinor(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => assertMoney({ currency: "BDT", amountMinor: 1.5 } as unknown as Money)).toThrow();
    expect(() => assertMoney({ currency: "USD", amountMinor: 100 } as unknown as Money)).toThrow();
  });

  it("add/sub stay in integer paisa", () => {
    const a = toMinor(100.5);
    const b = toMinor(0.01);
    expect(addMoney(a, b).amountMinor).toBe(10051);
    expect(subMoney(a, b).amountMinor).toBe(10049);
    expect(() => addMoney(a, { currency: "USD", amountMinor: 1 } as unknown as Money)).toThrow();
  });

  it("mulBps: deterministic truncating integer math", () => {
    // ৳100.50 at 8% → 10050 * 800 / 10000 = 804 paisa exactly
    expect(mulBps(10050, 800)).toBe(804);
    // ৳0.01 at 5bps → truncates to 0 (sub-bps precision is not money)
    expect(mulBps(1, 5)).toBe(0);
    // large amount safety: ৳90,000,000,000 at 8%
    expect(mulBps(9_000_000_000_000, 800)).toBe(720_000_000_000);
    expect(() => mulBps(1.5, 800)).toThrow();
    expect(() => mulBps(100, 812.5)).toThrow();
  });

  it("rateToBps converts legacy fraction rates to integer bps", () => {
    expect(rateToBps(0.08)).toBe(800);
    expect(rateToBps(0)).toBe(0);
    expect(rateToBps(1)).toBe(10000);
    expect(() => rateToBps(1.2)).toThrow();
    expect(() => rateToBps(-0.1)).toThrow();
  });

  it("fromMinor/formatMoney are display-only inverses", () => {
    expect(fromMinor(toMinor(100.5))).toBe(100.5);
    expect(formatMoney(toMinor(1234.56))).toBe("৳1,234.56");
    expect(formatMoney({ currency: "BDT", amountMinor: -10050 })).toBe("-৳100.50");
  });
});
