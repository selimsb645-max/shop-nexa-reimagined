/**
 * AVENTA SHOP — Money Representation (Prompt 04 §3)
 *
 * RULES (enforced everywhere in the finance v2 engine):
 *  1. NO floating-point arithmetic in financial calculations.
 *     All amounts are INTEGER MINOR UNITS (paisa): ৳100.50 → 10050.
 *  2. Currency is ALWAYS stored explicitly: currency = "BDT".
 *  3. Conversion from legacy float taka to minor units happens ONCE,
 *     at the read boundary, via toMinor() — never mid-calculation.
 *
 * JS numbers are safe for integer arithmetic up to 2^53-1, which at
 * paisa resolution covers ৳90 trillion — far beyond marketplace scale.
 */

export type Currency = "BDT";

export interface Money {
  currency: Currency;
  amountMinor: number; // integer paisa
}

/** A currency amount must be a safe integer. */
export function assertMoney(m: Money): void {
  if (m.currency !== "BDT") throw new Error(`finance/money: unsupported currency ${m.currency}`);
  if (!Number.isSafeInteger(m.amountMinor)) {
    throw new Error(`finance/money: unsafe amountMinor ${m.amountMinor}`);
  }
}

/**
 * ৳100.50 → { currency: "BDT", amountMinor: 10050 }. Rounds HALF-UP, once.
 *
 * IMPORTANT: the conversion is DECIMAL-STRING based, not float math —
 * `Math.round(2.345 * 100)` yields 234 (binary float dust) but the
 * correct answer is 235. This is the single float↔int conversion point
 * in the whole finance engine; after it, everything is integer paisa.
 */
export function toMinor(taka: number, currency: Currency = "BDT"): Money {
  if (!Number.isFinite(taka)) {
    throw new Error(`finance/money: non-finite taka value ${taka}`);
  }
  let amountMinor: number;
  const str = Math.abs(taka).toString();
  if (str.includes("e") || str.includes("E")) {
    // Exponential notation (extreme magnitudes) — fall back to float
    // rounding; assertMoney still guards the safe-integer boundary.
    amountMinor = Math.round(Math.abs(taka) * 100);
  } else {
    const neg = taka < 0;
    const [intPart = "0", fracPart = ""] = str.split(".");
    const frac2 = (fracPart + "00").slice(0, 2);       // first two decimals
    const remainder = fracPart.slice(2);                 // everything beyond
    let minor = Number(intPart) * 100 + Number(frac2 || "0");
    // Half-up on the remaining digits: any remainder ≥ 5… rounds up.
    if (remainder.length > 0 && Number(remainder[0]) >= 5) minor += 1;
    amountMinor = neg ? -minor : minor;
  }
  const m = { currency, amountMinor };
  assertMoney(m);
  return m;
}

/** 10050 → ৳100.50 — display only, never used in calculations. */
export function fromMinor(m: Money): number {
  assertMoney(m);
  return m.amountMinor / 100;
}

export function addMoney(a: Money, b: Money): Money {
  assertMoney(a); assertMoney(b);
  if (a.currency !== b.currency) throw new Error("finance/money: currency mismatch");
  return { currency: a.currency, amountMinor: a.amountMinor + b.amountMinor };
}

export function subMoney(a: Money, b: Money): Money {
  assertMoney(a); assertMoney(b);
  if (a.currency !== b.currency) throw new Error("finance/money: currency mismatch");
  return { currency: a.currency, amountMinor: a.amountMinor - b.amountMinor };
}

/**
 * Multiply a minor-unit amount by an integer basis-point rate with
 * deterministic integer math: amount * bps / 10000 (truncated).
 * Commission rates are resolved to whole basis points ONCE before this
 * call — sub-bps precision is not representable in money.
 */
export function mulBps(amountMinor: number, bps: number): number {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("finance/money: unsafe amountMinor");
  if (!Number.isInteger(bps)) throw new Error(`finance/money: bps must be integer, got ${bps}`);
  return Math.trunc((amountMinor * bps) / 10000);
}

/** Fraction rate (0–1, legacy DB format) → integer basis points. */
export function rateToBps(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`finance/money: invalid rate ${rate}`);
  }
  return Math.trunc(rate * 10000);
}

/** Format for logs/UI: ৳1,234.56. Display only. */
export function formatMoney(m: Money): string {
  assertMoney(m);
  const sign = m.amountMinor < 0 ? "-" : "";
  const abs = Math.abs(m.amountMinor);
  return `${sign}৳${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}
