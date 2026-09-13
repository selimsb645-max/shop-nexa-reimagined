/**
 * QC → CAMPAIGN backbone arrow — integration test (emulator-backed).
 * product.listed must make a product campaign-eligible automatically;
 * product.unlisted must drop it; nothing may double-fire.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";
import {
  submitProductForQc,
  startQcReview,
  completeQcReview,
  listQcPassedProduct,
  unlistProduct,
  QC_CHECKLIST,
  type QcChecklistResult,
} from "../../products-qc/qc.server";
import { processDueDispatches, listDueDispatches } from "../../kernel/events";
import {
  ensureCampaignListingSubscriber,
  CAMPAIGN_PRODUCT_CATALOG_COLLECTION,
} from "../listingRegistry.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8091;
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents`;

process.env.FIRESTORE_TEST_PROJECT = "test-project";
const REVIEWER = { uid: "qc-admin-1", adminRole: "content_admin" };

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORT}`;
  delete process.env.NODE_ENV;
  emulatorServer = await createFirestoreEmulator(EMULATOR_PORT);
  ensureCampaignListingSubscriber();
});
afterAll(async () => {
  await closeFirestoreEmulator(emulatorServer);
  delete process.env.FIRESTORE_EMULATOR_HOST;
});
beforeEach(() => {
  clearEmulatorStore();
});

function fullChecklist(pass: boolean): QcChecklistResult[] {
  return QC_CHECKLIST.map((key) => ({ key, passed: pass }));
}

async function submitInput() {
  return {
    productId: "p_bridge_1",
    sellerUid: "seller-bridge",
    productSnapshot: {
      title: "AVENTA Wireless Headphones Pro",
      photosCount: 4,
      priceMinor: 250000,
      categoryId: "electronics",
      stockQty: 12,
      description: "Premium wireless headphones with ANC and 30h battery life.",
    },
  };
}

async function getDoc(collection: string, id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/${collection}/${id}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { fields: Record<string, Record<string, unknown>> };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(json.fields)) {
    for (const [t, val] of Object.entries(v)) out[k] = val;
  }
  return out;
}

async function listDocs(collection: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${BASE}/${collection}?pageSize=100`);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    documents?: Array<{ fields: Record<string, Record<string, Record<string, unknown>>> }>;
  };
  return (json.documents ?? []).map((d) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d.fields)) {
      for (const [t, val] of Object.entries(v)) out[k] = val;
    }
    return out;
  });
}

describe("QC → campaign backbone arrow", () => {
  it("a QC-passed LISTED product becomes campaign-eligible automatically", async () => {
    const review = await submitProductForQc("test-project", await submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    await completeQcReview(
      "test-project",
      { reviewId: review.reviewId, checklist: fullChecklist(true) },
      REVIEWER,
    );
    await listQcPassedProduct("test-project", review.reviewId, REVIEWER);

    // the kernel emitted product.listed; drain the queue
    const sweep = await processDueDispatches("test-project");
    expect(sweep.done).toBeGreaterThanOrEqual(1);

    const catalog = await getDoc(CAMPAIGN_PRODUCT_CATALOG_COLLECTION, "p_bridge_1");
    expect(catalog).not.toBeNull();
    expect(catalog?.eligible).toBe(true);
    expect(catalog?.sellerUid).toBe("seller-bridge");

    // seller got the promo-eligibility notification
    const ntfs = await listDocs("campaignNotifications");
    const listed = ntfs.filter((n) => n.event === "PRODUCT_LISTED");
    expect(listed.length).toBe(1);
    expect(listed[0]?.audience).toBe("sellers");
  });

  it("unlisting drops the product from the promo catalog", async () => {
    const review = await submitProductForQc("test-project", await submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    await completeQcReview(
      "test-project",
      { reviewId: review.reviewId, checklist: fullChecklist(true) },
      REVIEWER,
    );
    await listQcPassedProduct("test-project", review.reviewId, REVIEWER);
    await processDueDispatches("test-project");

    await unlistProduct("test-project", review.reviewId, REVIEWER, "takedown test");
    const sweep = await processDueDispatches("test-project");
    expect(sweep.done).toBeGreaterThanOrEqual(1);

    const catalog = await getDoc(CAMPAIGN_PRODUCT_CATALOG_COLLECTION, "p_bridge_1");
    expect(catalog?.eligible).toBe(false);
  });

  it("repeated sweeps never duplicate catalog docs or notifications", async () => {
    const review = await submitProductForQc("test-project", await submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    await completeQcReview(
      "test-project",
      { reviewId: review.reviewId, checklist: fullChecklist(true) },
      REVIEWER,
    );
    await listQcPassedProduct("test-project", review.reviewId, REVIEWER);

    // drain twice — second sweep must be a pure no-op
    await processDueDispatches("test-project");
    const sweep2 = await processDueDispatches("test-project");
    expect(sweep2.processed).toBe(0);

    const catalogDocs = await listDocs(CAMPAIGN_PRODUCT_CATALOG_COLLECTION);
    expect(catalogDocs.filter((d) => d.productId === "p_bridge_1").length).toBe(1);
    const ntfs = await listDocs("campaignNotifications");
    expect(ntfs.filter((n) => n.event === "PRODUCT_LISTED").length).toBe(1);
  });

  it("QC-failed products never enter the campaign catalog", async () => {
    const review = await submitProductForQc("test-project", await submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    await completeQcReview(
      "test-project",
      { reviewId: review.reviewId, checklist: fullChecklist(false) },
      REVIEWER,
    );
    await processDueDispatches("test-project");

    const catalog = await getDoc(CAMPAIGN_PRODUCT_CATALOG_COLLECTION, "p_bridge_1");
    expect(catalog).toBeNull();
  });

  it("listDueDispatches only surfaces PENDING work", async () => {
    const review = await submitProductForQc("test-project", await submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    await completeQcReview(
      "test-project",
      { reviewId: review.reviewId, checklist: fullChecklist(true) },
      REVIEWER,
    );
    await listQcPassedProduct("test-project", review.reviewId, REVIEWER);

    const pending = await listDueDispatches("test-project");
    expect(pending.length).toBeGreaterThanOrEqual(1);
    await processDueDispatches("test-project");
    const after = await listDueDispatches("test-project");
    expect(after.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// FIRESTORE RULES — campaignProductCatalog (admin catalog browser)
// ═══════════════════════════════════════════════════════════════
describe("campaignProductCatalog — Firestore rules", () => {
  const fs = require("fs");
  const rules = fs.readFileSync("firestore.rules", "utf-8");
  const block = rules.match(/match \/campaignProductCatalog\/\{productId\} \{[\s\S]*?\n    \}/);

  it("has a dedicated match block for the catalog collection", () => {
    expect(block).toBeTruthy();
  });

  it("read is manager-gated (isCampaignManager), not public", () => {
    expect(block[0]).toContain("allow read: if isCampaignManager();");
    expect(block[0]).not.toContain("allow read: if true");
  });

  it("ALL client writes are denied — kernel subscriber only", () => {
    expect(block[0]).toContain("allow write: if false;");
  });

  it("isCampaignManager covers super/admin/platform/marketing only", () => {
    const fn = rules.match(/function isCampaignManager\(\)[\s\S]*?\n    \}/);
    expect(fn).toBeTruthy();
    expect(fn[0]).toContain("super_admin");
    expect(fn[0]).toContain("marketing_admin");
    expect(fn[0]).not.toContain("content_admin");
    expect(fn[0]).not.toContain("isApprovedSeller");
  });
});
