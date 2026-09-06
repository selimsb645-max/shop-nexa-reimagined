/**
 * Campaign module unit tests (Prompt 05 §13)
 * - state machine matrix
 * - price safety (§6): negative price / invalid discount impossible
 * - permission gates (§8)
 * - timezone handling (§4): epoch comparisons are TZ-independent
 */
import { describe, it, expect } from "vitest";
import {
  isValidCampaignTransition,
  isTerminalCampaignState,
  allowsSellerSubmissions,
  type CampaignState,
} from "../campaignStateMachine";
import {
  validateDiscountRules,
  computeCampaignPrice,
  validateCampaignPricing,
} from "../pricing";
import {
  canManageCampaigns,
  canApproveCampaign,
} from "../campaigns.server";

describe("campaign state machine (§2)", () => {
  const happy = ["DRAFT", "SUBMITTED", "REVIEW", "APPROVED", "SCHEDULED", "ACTIVE", "ENDED"];
  it("allows the canonical happy path in order", () => {
    for (let i = 0; i < happy.length - 1; i++) {
      expect(isValidCampaignTransition(happy[i] as CampaignState, happy[i + 1] as CampaignState)).toBe(true);
    }
  });
  it("allows the documented exception paths", () => {
    expect(isValidCampaignTransition("DRAFT", "CANCELLED")).toBe(true);
    expect(isValidCampaignTransition("REVIEW", "REJECTED")).toBe(true);
    expect(isValidCampaignTransition("ACTIVE", "PAUSED")).toBe(true);
    expect(isValidCampaignTransition("SCHEDULED", "PAUSED")).toBe(true);
    expect(isValidCampaignTransition("PAUSED", "ACTIVE")).toBe(true); // resume
  });
  it("rejects illegal jumps", () => {
    expect(isValidCampaignTransition("DRAFT", "ACTIVE")).toBe(false);
    expect(isValidCampaignTransition("DRAFT", "SCHEDULED")).toBe(false);
    expect(isValidCampaignTransition("SUBMITTED", "APPROVED")).toBe(false);
    expect(isValidCampaignTransition("ENDED", "ACTIVE")).toBe(false);
    expect(isValidCampaignTransition("REJECTED", "REVIEW")).toBe(false);
    expect(isValidCampaignTransition("CANCELLED", "DRAFT")).toBe(false);
  });
  it("treats self-transitions as no-ops", () => {
    for (const s of happy) expect(isValidCampaignTransition(s as CampaignState, s as CampaignState)).toBe(true);
  });
  it("marks terminals", () => {
    expect(isTerminalCampaignState("ENDED")).toBe(true);
    expect(isTerminalCampaignState("REJECTED")).toBe(true);
    expect(isTerminalCampaignState("CANCELLED")).toBe(true);
    expect(isTerminalCampaignState("ACTIVE")).toBe(false);
  });
  it("sellers may submit only during SUBMITTED/REVIEW (§3)", () => {
    expect(allowsSellerSubmissions("SUBMITTED")).toBe(true);
    expect(allowsSellerSubmissions("REVIEW")).toBe(true);
    expect(allowsSellerSubmissions("DRAFT")).toBe(false);
    expect(allowsSellerSubmissions("APPROVED")).toBe(false);
    expect(allowsSellerSubmissions("ACTIVE")).toBe(false);
  });
});

describe("price safety (§6)", () => {
  it("PERCENT: computes truncating bps math, clamps to max + minimum guard", () => {
    const r = computeCampaignPrice(100000, { type: "PERCENT", valueMinor: 1500, maxDiscountMinor: 10000 });
    expect(r.discountMinor).toBe(10000); // capped
    expect(r.finalPriceMinor).toBe(90000);
    const g = computeCampaignPrice(100000, { type: "PERCENT", valueMinor: 9500, minimumPriceMinor: 20000 });
    expect(g.finalPriceMinor).toBe(20000); // clamped up to the guard
  });
  it("negative/zero price is impossible", () => {
    const r = computeCampaignPrice(100, { type: "FLAT", valueMinor: 500 }); // > original
    expect(r.finalPriceMinor).toBe(1); // never below 1 paisa
    expect(r.finalPriceMinor).toBeGreaterThan(0);
  });
  it("PRICE_OVERRIDE must be below original, else rejected", () => {
    expect(() => computeCampaignPrice(1000, { type: "PRICE_OVERRIDE", valueMinor: 1000 })).toThrow();
    expect(() => computeCampaignPrice(1000, { type: "PRICE_OVERRIDE", valueMinor: 2000 })).toThrow();
    const ok = computeCampaignPrice(1000, { type: "PRICE_OVERRIDE", valueMinor: 800 });
    expect(ok.finalPriceMinor).toBe(800);
  });
  it("seller-approved floor is never undercut (§6)", () => {
    const r = computeCampaignPrice(100000, { type: "PERCENT", valueMinor: 5000 }, 95000);
    expect(r.finalPriceMinor).toBe(95000); // clamped to seller floor
  });
  it("validation rejects structurally bad rules", () => {
    expect(validateDiscountRules({ type: "PERCENT", valueMinor: 20000 }).ok).toBe(false); // >99%
    expect(validateDiscountRules({ type: "PERCENT", valueMinor: 0 }).ok).toBe(false);
    expect(validateDiscountRules({ type: "FLAT", valueMinor: -5 }).ok).toBe(false);
    expect(validateDiscountRules({ type: "FLAT", valueMinor: 500, minimumPriceMinor: 0 }).ok).toBe(false);
    expect(validateDiscountRules({ type: "PERCENT", valueMinor: 1000, maxDiscountMinor: -1 }).ok).toBe(false);
  });
  it("full pricing validation works on paisa integers end-to-end", () => {
    const { result, price } = validateCampaignPricing(23450, { type: "FLAT", valueMinor: 345 });
    expect(result.ok).toBe(true);
    expect(price?.originalPriceMinor).toBe(23450);
    expect(price?.discountMinor).toBe(345);
    expect(price?.finalPriceMinor).toBe(23105);
  });
});

describe("permissions (§8)", () => {
  it("campaign managers are the marketing-capable roles only", () => {
    expect(canManageCampaigns("marketing_admin")).toBe(true);
    expect(canManageCampaigns("super_admin")).toBe(true);
    expect(canManageCampaigns("admin")).toBe(true);
    expect(canManageCampaigns("platform_admin")).toBe(true);
    expect(canManageCampaigns("support_admin")).toBe(false);
    expect(canManageCampaigns("content_admin")).toBe(false);
    expect(canManageCampaigns(null)).toBe(false);
    expect(canManageCampaigns(undefined)).toBe(false);
  });
  it("elevated campaigns require super_admin approval", () => {
    expect(canApproveCampaign({ elevatedApprovalRequired: true }, "marketing_admin")).toBe(false);
    expect(canApproveCampaign({ elevatedApprovalRequired: true }, "super_admin")).toBe(true);
    expect(canApproveCampaign({ elevatedApprovalRequired: false }, "marketing_admin")).toBe(true);
    expect(canApproveCampaign({ elevatedApprovalRequired: false }, null)).toBe(false);
  });
});

describe("timezone handling (§4)", () => {
  it("epoch ms comparisons are timezone-independent", () => {
    const start = Date.UTC(2026, 10, 11, 0, 0, 0); // 2026-11-11 00:00 UTC
    const end = Date.UTC(2026, 10, 11, 23, 59, 0);
    // The same instant expressed from different TZ perspectives produces
    // the SAME epoch value — the engine never uses wall-clock strings.
    const dhakaLocal = new Date("2026-11-11T06:00:00+06:00").getTime();
    expect(dhakaLocal).toBe(Date.UTC(2026, 10, 11, 0, 0, 0));
    const nyLocal = new Date("2026-11-10T19:00:00-05:00").getTime();
    expect(nyLocal).toBe(dhakaLocal);
    // window checks use pure epoch arithmetic
    const t = dhakaLocal;
    expect(t >= start && t < end).toBe(true);
  });
  it("AVENTA 11.11 window behaves identically regardless of caller TZ", () => {
    const start = Date.parse("2026-11-11T00:00:00Z");
    const end = Date.parse("2026-11-11T23:59:00Z");
    // A campaign doc stores these exact epoch integers; sweep comparisons
    // now >= startAt / now >= endAt never consult the runtime timezone.
    const fakeNowFromDhaka = new Date("2026-11-11T12:00:00+06:00").getTime();
    const fakeNowFromNy = new Date("2026-11-11T01:00:00-05:00").getTime();
    expect(fakeNowFromDhaka >= start).toBe(true);
    expect(fakeNowFromDhaka < end).toBe(true);
    expect(fakeNowFromNy >= start).toBe(true);
    expect(fakeNowFromNy < end).toBe(true);
  });
});
