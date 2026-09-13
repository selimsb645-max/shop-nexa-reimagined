/**
 * AVENTA SHOP — Prompt 05 §13 INTEGRATION TESTS (emulator-backed)
 *
 * Full campaign lifecycle against the in-memory Firestore emulator:
 *   creation → approval → scheduling → automatic activation →
 *   automatic expiration, plus every exception path:
 *   invalid discount, flash-sale stock race, seller unauthorized
 *   activation, admin unauthorized modification, rollback,
 *   notifications, audit log, timezone handling, sanitized
 *   storefront view.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";

import {
  createCampaign,
  getCampaign,
  transitionCampaign,
  advanceCampaigns,
  readActiveHomeConfig,
  getActiveCampaignHome,
  listCampaignEvents,
  canApproveCampaign,
  CAMPAIGNS_COLLECTION,
  CAMPAIGN_NOTIFICATIONS_COLLECTION,
  type Campaign,
  type CreateCampaignInput,
} from "../campaigns.server";
import {
  submitCampaignProducts,
  reviewCampaignSubmission,
  listSellerSubmissions,
  CAMPAIGN_SUBMISSIONS_COLLECTION,
} from "../sellerSubmissions.server";
import {
  createFlashSale,
  reserveFlashSaleStock,
  releaseFlashSaleStock,
  getFlashSale,
} from "../flashSale.server";
import type { CampaignActor } from "../campaigns.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8088;
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents`;

const MARKETING: CampaignActor = { uid: "admin-marketing", adminRole: "marketing_admin" };
const SUPER: CampaignActor = { uid: "admin-super", adminRole: "super_admin" };
const SUPPORT: CampaignActor = { uid: "admin-support", adminRole: "support_admin" };
const SELLER: CampaignActor = { uid: "seller-1", adminRole: null };

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORT}`;
  process.env.FIRESTORE_TEST_PROJECT = "test-project";
  delete process.env.NODE_ENV;
  emulatorServer = await createFirestoreEmulator(EMULATOR_PORT);
});

afterAll(async () => {
  await closeFirestoreEmulator(emulatorServer);
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_TEST_PROJECT;
});

beforeEach(() => {
  clearEmulatorStore();
});

// ── seeding helpers (same style as the finance suite) ─────────────
function fsValue(v: unknown): Record<string, unknown> {
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "boolean") return { booleanValue: v };
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fsValue(x)]),
        ),
      },
    };
  }
  return { stringValue: String(v) };
}

async function seedDoc(path: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])),
    }),
  });
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status}`);
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { fields?: Record<string, unknown> };
  return json.fields ?? null;
}

function baseCampaignInput(now: number): CreateCampaignInput {
  return {
    name: "AVENTA 11.11",
    description: "The 11.11 mega sale",
    startAt: now + 60_000,
    endAt: now + 120_000,
    banner: {
      imageUrl: "https://cdn/1111.jpg",
      title: "AVENTA 11.11",
      subtitle: "মেগা সেল",
      link: "/flash-sales",
    },
    eligibleCategories: ["electronics"],
    eligibleProducts: [],
    eligibleSellers: [],
    discountRules: { type: "PERCENT", valueMinor: 1500, minimumPriceMinor: 1000 },
    couponRules: {
      codes: ["AVENTA1111"],
      minOrderMinor: 50000,
      maxUses: 1000,
      perCustomerLimit: 1,
    },
    homeModules: {
      heroBanner: true,
      campaignBanner: true,
      featuredProducts: true,
      flashSaleSection: true,
      featuredProductIds: ["p1", "p2"],
    },
    createdBy: MARKETING.uid,
  };
}

/** Drive a campaign all the way to SCHEDULED through legal transitions. */
async function makeScheduledCampaign(now: number, elevated = false): Promise<Campaign> {
  const c = await createCampaign("test-project", baseCampaignInput(now));
  if (elevated) {
    await seedDoc(`${CAMPAIGNS_COLLECTION}/${c.campaignId}`, { elevatedApprovalRequired: true });
  }
  await transitionCampaign("test-project", c.campaignId, "SUBMITTED", MARKETING);
  await transitionCampaign("test-project", c.campaignId, "REVIEW", MARKETING);
  await transitionCampaign("test-project", c.campaignId, "APPROVED", elevated ? SUPER : MARKETING);
  return transitionCampaign(
    "test-project",
    c.campaignId,
    "SCHEDULED",
    elevated ? SUPER : MARKETING,
  );
}

describe("§13 campaign lifecycle", () => {
  it("creates → approves → schedules → auto-activates → auto-expires", async () => {
    const now = Date.now();
    const c = await makeScheduledCampaign(now);

    let live = await getCampaign("test-project", c.campaignId);
    expect(live?.status).toBe("SCHEDULED");

    // Not yet started — sweep must not activate (§4 clock authority).
    let sweep = await advanceCampaigns("test-project", now + 30_000);
    expect(sweep.activated).toHaveLength(0);

    // Start time reached (server clock) → ACTIVE.
    sweep = await advanceCampaigns("test-project", now + 61_000);
    expect(sweep.activated).toContain(c.campaignId);
    live = await getCampaign("test-project", c.campaignId);
    expect(live?.status).toBe("ACTIVE");
    expect(live?.activatedAt).not.toBeNull();

    // Homepage content switched (§5).
    const home = await readActiveHomeConfig("test-project");
    expect(home.campaignId).toBe(c.campaignId);
    expect(home.heroBanner?.imageUrl).toBe("https://cdn/1111.jpg");
    expect(home.featuredProductIds).toEqual(["p1", "p2"]);

    // Not yet ended.
    sweep = await advanceCampaigns("test-project", now + 100_000);
    expect(sweep.ended).toHaveLength(0);

    // End time reached → ENDED (§4).
    sweep = await advanceCampaigns("test-project", now + 121_000);
    expect(sweep.ended).toContain(c.campaignId);
    live = await getCampaign("test-project", c.campaignId);
    expect(live?.status).toBe("ENDED");
    expect(live?.endedAt).not.toBeNull();

    // Terminal: no further transitions.
    await expect(transitionCampaign("test-project", c.campaignId, "ACTIVE", SUPER)).rejects.toThrow(
      /illegal transition/,
    );
  });

  it("CAMPAIGN_ENDING fires once within the lead window", async () => {
    const now = Date.now();
    const c = await makeScheduledCampaign(now);
    await advanceCampaigns("test-project", now + 61_000);
    // 10s lead → 20s remaining is still outside the window
    let sweep = await advanceCampaigns("test-project", now + 100_000, 10_000);
    expect(sweep.endingNotified).toHaveLength(0);
    // Inside the lead window → notified once
    sweep = await advanceCampaigns("test-project", now + 116_000, 10_000);
    expect(sweep.endingNotified).toContain(c.campaignId);
    // Idempotent — second sweep does not re-notify.
    sweep = await advanceCampaigns("test-project", now + 118_000, 10_000);
    expect(sweep.endingNotified).toHaveLength(0);
  });
});

describe("§6 invalid discount", () => {
  it("rejects structurally invalid discount rules at creation", async () => {
    const now = Date.now();
    const input = baseCampaignInput(now);
    input.discountRules = { type: "PERCENT", valueMinor: 20000 }; // 200%
    await expect(createCampaign("test-project", input)).rejects.toThrow(/validation/);
  });

  it("rejects seller submissions with negative or oversized discounts", async () => {
    const now = Date.now();
    const c = await makeScheduledCampaign(now);
    // campaign back to SUBMITTED for seller phase
    await seedDoc(`${CAMPAIGNS_COLLECTION}/${c.campaignId}`, { status: "SUBMITTED" });

    await expect(
      submitCampaignProducts("test-project", {
        campaignId: c.campaignId,
        sellerUid: SELLER.uid,
        shopName: "Seller One",
        note: null,
        items: [
          {
            productId: "p1",
            originalPriceMinor: 50000,
            discountRules: { type: "FLAT", valueMinor: 60000 }, // more than original
            stockQty: 5,
            sellerApprovedPriceMinor: 40000,
          },
        ],
      }),
    ).rejects.toThrow();

    await expect(
      submitCampaignProducts("test-project", {
        campaignId: c.campaignId,
        sellerUid: SELLER.uid,
        shopName: "Seller One",
        note: null,
        items: [
          {
            productId: "p1",
            originalPriceMinor: 50000,
            discountRules: { type: "FLAT", valueMinor: -100 },
            stockQty: 5,
            sellerApprovedPriceMinor: 40000,
          },
        ],
      }),
    ).rejects.toThrow();
  });
});

describe("§7 flash sale", () => {
  it("reserves stock safely and enforces the per-customer limit", async () => {
    const now = Date.now();
    await createFlashSale("test-project", {
      campaignId: "fs1",
      startAt: now - 1000,
      endAt: now + 3600_000,
      stockLimit: 10,
      perCustomerLimit: 2,
      originalPriceMinor: 50000,
      salePriceMinor: 35000,
    });
    const r1 = await reserveFlashSaleStock("test-project", {
      campaignId: "fs1",
      customerId: "c1",
      quantity: 2,
    });
    expect(r1.ok).toBe(true);
    const r2 = await reserveFlashSaleStock("test-project", {
      campaignId: "fs1",
      customerId: "c1",
      quantity: 1,
    });
    expect(r2).toMatchObject({ ok: false, code: "CUSTOMER_LIMIT" });
    const r3 = await reserveFlashSaleStock("test-project", {
      campaignId: "fs1",
      customerId: "c2",
      quantity: 2,
    });
    expect(r3.ok).toBe(true);
    // release returns headroom
    await releaseFlashSaleStock("test-project", "fs1", "c1", 2);
    const r4 = await reserveFlashSaleStock("test-project", {
      campaignId: "fs1",
      customerId: "c1",
      quantity: 2,
    });
    expect(r4.ok).toBe(true);
  });

  it("race for the last unit: one winner, one SOLD_OUT (§13 stock race)", async () => {
    const now = Date.now();
    await createFlashSale("test-project", {
      campaignId: "fs-race",
      startAt: now - 1000,
      endAt: now + 3600_000,
      stockLimit: 1,
      perCustomerLimit: 5,
      originalPriceMinor: 10000,
      salePriceMinor: 5000,
    });
    const [a, b] = await Promise.all([
      reserveFlashSaleStock("test-project", {
        campaignId: "fs-race",
        customerId: "ca",
        quantity: 1,
      }),
      reserveFlashSaleStock("test-project", {
        campaignId: "fs-race",
        customerId: "cb",
        quantity: 1,
      }),
    ]);
    const oks = [a, b].filter((r) => r.ok).length;
    expect(oks).toBe(1); // never 2 — no oversell possible
    const soldOut = [a, b].find((r) => !r.ok);
    expect(soldOut).toMatchObject({ ok: false, code: "SOLD_OUT" });
    const doc = await getFlashSale("test-project", "fs-race");
    expect(doc?.stockReserved).toBeLessThanOrEqual(doc!.stockTotal);
  });

  it("refuses reservations outside the sale window (§4/§7)", async () => {
    const now = Date.now();
    await createFlashSale("test-project", {
      campaignId: "fs-late",
      startAt: now + 3600_000,
      endAt: now + 7200_000,
      stockLimit: 5,
      perCustomerLimit: 1,
      originalPriceMinor: 10000,
      salePriceMinor: 5000,
    });
    const r = await reserveFlashSaleStock("test-project", {
      campaignId: "fs-late",
      customerId: "c1",
      quantity: 1,
    });
    expect(r).toMatchObject({ ok: false, code: "NOT_ACTIVE" });
  });
});

describe("§8/§12 authorization", () => {
  it("sellers cannot activate or approve campaigns (§13 seller unauthorized activation)", async () => {
    const now = Date.now();
    const c = await createCampaign("test-project", baseCampaignInput(now));
    await expect(
      transitionCampaign("test-project", c.campaignId, "APPROVED", SELLER),
    ).rejects.toThrow(/permission/);
    await expect(
      transitionCampaign("test-project", c.campaignId, "SCHEDULED", SELLER),
    ).rejects.toThrow(/permission/);
    const live = await getCampaign("test-project", c.campaignId);
    expect(live?.status).toBe("DRAFT"); // untouched
  });

  it("non-marketing admins cannot modify campaigns (§13 admin unauthorized modification)", async () => {
    const now = Date.now();
    const c = await createCampaign("test-project", baseCampaignInput(now));
    await expect(
      transitionCampaign("test-project", c.campaignId, "SUBMITTED", SUPPORT),
    ).rejects.toThrow(/permission/);
  });

  it("elevated campaigns require super_admin approval (§8)", async () => {
    const now = Date.now();
    const c = await createCampaign("test-project", baseCampaignInput(now));
    await seedDoc(`${CAMPAIGNS_COLLECTION}/${c.campaignId}`, { elevatedApprovalRequired: true });
    await transitionCampaign("test-project", c.campaignId, "SUBMITTED", MARKETING);
    await transitionCampaign("test-project", c.campaignId, "REVIEW", MARKETING);
    await expect(
      transitionCampaign("test-project", c.campaignId, "APPROVED", MARKETING),
    ).rejects.toThrow(/elevated/);
    await transitionCampaign("test-project", c.campaignId, "APPROVED", SUPER);
    expect(canApproveCampaign({ elevatedApprovalRequired: true }, "marketing_admin")).toBe(false);
  });
});

describe("§9 rollback", () => {
  it("pause restores the previous homepage configuration", async () => {
    const now = Date.now();
    // previous, valid homepage configuration
    await seedDoc("homeConfig/active", {
      campaignId: null,
      campaignName: "Everyday store",
      heroBanner: {
        imageUrl: "https://cdn/hero.jpg",
        title: "AVENTA SHOP",
        subtitle: null,
        link: null,
      },
      campaignBanner: null,
      flashSaleSection: false,
      featuredProductIds: ["daily1"],
      switchedAt: 123,
    });

    const c = await makeScheduledCampaign(now);
    await advanceCampaigns("test-project", now + 61_000);
    let home = await readActiveHomeConfig("test-project");
    expect(home.campaignId).toBe(c.campaignId); // switched

    // PAUSE → rollback to the previous configuration (§9)
    await transitionCampaign("test-project", c.campaignId, "PAUSED", SUPER);
    home = await readActiveHomeConfig("test-project");
    expect(home.campaignId).toBeNull();
    expect(home.campaignName).toBe("Everyday store");
    expect(home.heroBanner?.imageUrl).toBe("https://cdn/hero.jpg");
    expect(home.featuredProductIds).toEqual(["daily1"]);

    // resume → switch back to the campaign
    await transitionCampaign("test-project", c.campaignId, "ACTIVE", SUPER);
    home = await readActiveHomeConfig("test-project");
    expect(home.campaignId).toBe(c.campaignId);

    // cancel mid-flight also restores (§9)
    await transitionCampaign("test-project", c.campaignId, "CANCELLED", SUPER);
    home = await readActiveHomeConfig("test-project");
    expect(home.campaignName).toBe("Everyday store");
    const live = await getCampaign("test-project", c.campaignId);
    expect(live?.status).toBe("CANCELLED");
  });
});

describe("§10 notifications + §11 audit", () => {
  it("queues the full notification set and keeps an append-only audit trail", async () => {
    const now = Date.now();
    const c = await makeScheduledCampaign(now); // SCHEDULED → CAMPAIGN_SCHEDULED
    await advanceCampaigns("test-project", now + 61_000); // → CAMPAIGN_STARTED
    await advanceCampaigns("test-project", now + 121_000); // → CAMPAIGN_ENDED

    const events = await listCampaignEvents("test-project", c.campaignId);
    const actions = events.map((e) => e.action);
    expect(actions).toContain("created");
    expect(actions).toContain("submitted");
    expect(actions).toContain("approved");
    expect(actions).toContain("scheduled");
    expect(actions).toContain("activated");
    expect(actions).toContain("ended");
    expect(actions).toContain("home_switched");
    expect(actions).toContain("home_restored");
    // audit ordering by creation time
    const times = events.map((e) => e.createdAt);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // actors recorded (§11)
    const scheduled = events.find((e) => e.action === "scheduled");
    expect(scheduled?.actorUid).toBe(MARKETING.uid);
    const activated = events.find((e) => e.action === "activated");
    expect(activated?.actorUid).toBe("system"); // sweep actor

    // notifications queue (§10)
    const res = await fetch(`${BASE}/${CAMPAIGN_NOTIFICATIONS_COLLECTION}`);
    const json = (await res.json()) as { documents?: Array<{ fields: Record<string, unknown> }> };
    const notifs = (json.documents ?? []).map((d) => d.fields);
    expect(notifs.length).toBeGreaterThanOrEqual(3);
  });
});

describe("§3 seller submissions", () => {
  it("seller submits → admin approves; rejected re-review blocked", async () => {
    const now = Date.now();
    const c = await makeScheduledCampaign(now);
    await seedDoc(`${CAMPAIGNS_COLLECTION}/${c.campaignId}`, { status: "SUBMITTED" });

    const sub = await submitCampaignProducts("test-project", {
      campaignId: c.campaignId,
      sellerUid: "seller-1",
      shopName: "Seller One",
      note: "best stock",
      items: [
        {
          productId: "p1",
          originalPriceMinor: 50000,
          discountRules: { type: "PERCENT", valueMinor: 1000 }, // 10%
          stockQty: 5,
          sellerApprovedPriceMinor: 40000,
        },
      ],
    });
    expect(sub.status).toBe("PENDING_REVIEW");

    const approved = await reviewCampaignSubmission(
      "test-project",
      sub.submissionId,
      "APPROVED",
      MARKETING,
      "looks good",
    );
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedBy).toBe(MARKETING.uid);

    // double review is refused (idempotent state machine)
    await expect(
      reviewCampaignSubmission("test-project", sub.submissionId, "REJECTED", MARKETING, null),
    ).rejects.toThrow(/already/);

    // seller sees only their own submissions
    const mine = await listSellerSubmissions("test-project", "seller-1");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.campaignName).toBe("AVENTA 11.11");
  });

  it("submissions close when the campaign leaves SUBMITTED/REVIEW (§3)", async () => {
    const now = Date.now();
    const c = await makeScheduledCampaign(now); // SCHEDULED
    await expect(
      submitCampaignProducts("test-project", {
        campaignId: c.campaignId,
        sellerUid: "seller-1",
        shopName: "Seller One",
        note: null,
        items: [
          {
            productId: "p1",
            originalPriceMinor: 50000,
            discountRules: { type: "PERCENT", valueMinor: 500 },
            stockQty: 5,
            sellerApprovedPriceMinor: 40000,
          },
        ],
      }),
    ).rejects.toThrow(/closed/);
  });
});

describe("§12 sanitized storefront view", () => {
  it("getActiveCampaignHome never exposes internal configuration", async () => {
    const now = Date.now();
    const c = await makeScheduledCampaign(now);
    await advanceCampaigns("test-project", now + 61_000);

    const view = await getActiveCampaignHome("test-project");
    expect(view.campaign).not.toBeNull();
    expect(view.campaign?.name).toBe("AVENTA 11.11");
    expect(view.campaign?.endsAt).toBeGreaterThan(now);
    // internal config MUST NOT leak (§12)
    const raw = JSON.stringify(view);
    expect(raw).not.toContain("AVENTA1111"); // coupon code
    expect(raw).not.toContain("couponRules");
    expect(raw).not.toContain("discountRules");
    expect(raw).not.toContain("eligibleSellers");
    expect(raw).not.toContain("elevatedApprovalRequired");
  });

  it("returns an empty view when no campaign is active", async () => {
    const view = await getActiveCampaignHome("test-project");
    expect(view.campaign).toBeNull();
    expect(view.home.campaignId).toBeNull();
  });
});
