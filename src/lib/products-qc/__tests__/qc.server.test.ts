/**
 * Product QC — integration tests (emulator-backed).
 * Backbone flow: submit → review → pass/fail → list, plus the
 * illegal-transition, permission, resubmission and event-emission paths.
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
  readQcReview,
  validateProductForQc,
  canReviewQc,
  QC_CHECKLIST,
  QC_REVIEWS_COLLECTION,
  type QcChecklistResult,
} from "../qc.server";
import { isValidQcTransition, allowsSellerQcActions } from "../qcStateMachine";
import { emitDomainEvent, DOMAIN_EVENTS_COLLECTION } from "../../kernel/events";

let emulatorServer: Server;
const EMULATOR_PORT = 8090;
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents`;

const REVIEWER = { uid: "qc-admin-1", adminRole: "content_admin" };
const SELLER = { uid: "seller-1" };

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
beforeEach(() => { clearEmulatorStore(); });

function goodSnapshot() {
  return {
    title: "AVENTA Wireless Headphones Pro",
    photosCount: 4,
    priceMinor: 250000,
    categoryId: "electronics",
    stockQty: 12,
    description: "Premium wireless headphones with ANC and 30h battery.",
  };
}

function fullChecklist(pass: boolean): QcChecklistResult[] {
  return QC_CHECKLIST.map((key) => ({ key, passed: pass, note: pass ? null : "not ok" }));
}

function submitInput(overrides: Record<string, unknown> = {}) {
  return {
    productId: "p1",
    sellerUid: SELLER.uid,
    productSnapshot: { ...goodSnapshot(), ...overrides },
  };
}

describe("QC state machine", () => {
  it("allows the canonical happy path", () => {
    expect(isValidQcTransition("DRAFT", "PENDING_QC")).toBe(true);
    expect(isValidQcTransition("PENDING_QC", "IN_QC")).toBe(true);
    expect(isValidQcTransition("IN_QC", "QC_PASSED")).toBe(true);
    expect(isValidQcTransition("QC_PASSED", "LISTED")).toBe(true);
    expect(isValidQcTransition("LISTED", "UNLISTED")).toBe(true);
    expect(isValidQcTransition("UNLISTED", "LISTED")).toBe(true);
  });
  it("blocks listing without QC and blocks shortcuts", () => {
    expect(isValidQcTransition("PENDING_QC", "LISTED")).toBe(false);
    expect(isValidQcTransition("DRAFT", "IN_QC")).toBe(false);
    expect(isValidQcTransition("QC_FAILED", "LISTED")).toBe(false);
  });
  it("failed products can be resubmitted by the seller", () => {
    expect(isValidQcTransition("QC_FAILED", "PENDING_QC")).toBe(true);
    expect(allowsSellerQcActions("QC_FAILED")).toBe(true);
    expect(allowsSellerQcActions("IN_QC")).toBe(false);
    expect(allowsSellerQcActions("LISTED")).toBe(false);
  });
});

describe("QC submission validation", () => {
  it("rejects structurally bad products before they enter the queue", () => {
    expect(validateProductForQc(submitInput({ title: "ab" })).ok).toBe(false);
    expect(validateProductForQc(submitInput({ photosCount: 0 })).ok).toBe(false);
    expect(validateProductForQc(submitInput({ priceMinor: 0 })).ok).toBe(false);
    expect(validateProductForQc(submitInput({ priceMinor: 12.5 })).ok).toBe(false);
    expect(validateProductForQc(submitInput({ categoryId: null })).ok).toBe(false);
    expect(validateProductForQc(submitInput({ description: "short" })).ok).toBe(false);
    expect(validateProductForQc(submitInput({ flagged: true })).ok).toBe(false);
    expect(validateProductForQc(submitInput()).ok).toBe(true);
  });
});

describe("QC lifecycle", () => {
  it("submit → start → pass → list, with domain events emitted", async () => {
    const review = await submitProductForQc("test-project", submitInput());
    expect(review.status).toBe("PENDING_QC");

    const started = await startQcReview("test-project", review.reviewId, REVIEWER);
    expect(started.status).toBe("IN_QC");
    expect(started.reviewerUid).toBe(REVIEWER.uid);

    const passed = await completeQcReview("test-project", {
      reviewId: review.reviewId,
      checklist: fullChecklist(true),
    }, REVIEWER);
    expect(passed.status).toBe("QC_PASSED");
    expect(passed.failReasons).toEqual([]);

    const listed = await listQcPassedProduct("test-project", review.reviewId, REVIEWER);
    expect(listed.status).toBe("LISTED");
    expect(listed.listedAt).not.toBeNull();

    // backbone events landed in the bus
    const res = await fetch(`${BASE}/${DOMAIN_EVENTS_COLLECTION}`);
    const json = (await res.json()) as { documents?: Array<{ fields: Record<string, unknown> }>; };
    const types = (json.documents ?? []).map((d) => String((d.fields.type as Record<string, unknown>).stringValue));
    expect(types).toContain("product.qc.passed");
    expect(types).toContain("product.listed");

    // listed product can be taken down and relisted
    const unlisted = await unlistProduct("test-project", review.reviewId, REVIEWER, "photo mismatch");
    expect(unlisted.status).toBe("UNLISTED");
    const relisted = await listQcPassedProduct("test-project", review.reviewId, REVIEWER);
    expect(relisted.status).toBe("LISTED");
  });

  it("failed checklist → QC_FAILED with reasons → seller resubmits → passes", async () => {
    const review = await submitProductForQc("test-project", submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    const failed = await completeQcReview("test-project", {
      reviewId: review.reviewId,
      checklist: fullChecklist(false),
    }, REVIEWER);
    expect(failed.status).toBe("QC_FAILED");
    expect(failed.failReasons.length).toBe(QC_CHECKLIST.length);

    // the failed event was emitted too
    const res = await fetch(`${BASE}/${DOMAIN_EVENTS_COLLECTION}`);
    const json = (await res.json()) as { documents?: Array<{ fields: Record<string, unknown> }>; };
    const types = (json.documents ?? []).map((d) => String((d.fields.type as Record<string, unknown>).stringValue));
    expect(types).toContain("product.qc.failed");

    // a QC_FAILED product cannot be listed directly (the gate holds)
    await expect(
      listQcPassedProduct("test-project", review.reviewId, REVIEWER),
    ).rejects.toThrow(/illegal transition/);

    // seller fixes and resubmits
    const resub = await submitProductForQc("test-project", submitInput({ description: "Fixed: premium wireless headphones, ANC, 30h battery, USB-C fast charge." }));
    expect(resub.status).toBe("PENDING_QC");
    await startQcReview("test-project", review.reviewId, REVIEWER);
    const passed = await completeQcReview("test-project", {
      reviewId: review.reviewId, checklist: fullChecklist(true),
    }, REVIEWER);
    expect(passed.status).toBe("QC_PASSED");
  });

  it("cannot complete a review that is not IN_QC", async () => {
    const review = await submitProductForQc("test-project", submitInput());
    await expect(
      completeQcReview("test-project", { reviewId: review.reviewId, checklist: fullChecklist(true) }, REVIEWER),
    ).rejects.toThrow(/not IN_QC/);
  });

  it("checklist must cover every item exactly once", async () => {
    const review = await submitProductForQc("test-project", submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    const partial = fullChecklist(true).slice(0, 3);
    await expect(
      completeQcReview("test-project", { reviewId: review.reviewId, checklist: partial }, REVIEWER),
    ).rejects.toThrow(/checklist/);
  });

  it("review id is deterministic per product; double-queueing is refused", async () => {
    const a = await submitProductForQc("test-project", submitInput());
    expect(a.reviewId).toBe("qc_p1");
    // same product again while still queued → refused, not duplicated
    await expect(
      submitProductForQc("test-project", submitInput()),
    ).rejects.toThrow(/cannot submit/);
    const read = await readQcReview("test-project", "qc_p1");
    expect(read.status).toBe("PENDING_QC");
  });

  it("regression: reviewer transitions never wipe the submitted productSnapshot", async () => {
    // commitWrites sends REST commits WITHOUT updateMask (full-doc
    // replace). writeTransition used to drop productSnapshot — the
    // reviewer's source of truth for the checklist (Sep 6, PART 2 fix).
    const review = await submitProductForQc("test-project", submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    let res = await fetch(`${BASE}/${QC_REVIEWS_COLLECTION}/${review.reviewId}`);
    let doc = (await res.json()) as { fields?: Record<string, unknown> };
    const snap1 = doc.fields?.["productSnapshot"] as Record<string, unknown> | undefined;
    expect(typeof (snap1 as { stringValue?: string } | undefined)?.stringValue).toBe("string");

    await completeQcReview("test-project", { reviewId: review.reviewId, checklist: fullChecklist(true) }, REVIEWER);
    await listQcPassedProduct("test-project", review.reviewId, REVIEWER);
    res = await fetch(`${BASE}/${QC_REVIEWS_COLLECTION}/${review.reviewId}`);
    doc = (await res.json()) as { fields?: Record<string, unknown> };
    const snap2 = doc.fields?.["productSnapshot"] as { stringValue?: string } | undefined;
    expect(typeof snap2?.stringValue).toBe("string");
    expect(snap2?.stringValue).toBe(snap1?.stringValue);
  });

  it("sellers cannot act from states they don't own (e.g. IN_QC)", async () => {
    const review = await submitProductForQc("test-project", submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    await expect(
      submitProductForQc("test-project", submitInput()),
    ).rejects.toThrow(/cannot submit/);
  });
});

describe("QC permissions", () => {
  it("only QC-capable roles can review", () => {
    expect(canReviewQc("content_admin")).toBe(true);
    expect(canReviewQc("super_admin")).toBe(true);
    expect(canReviewQc("support_admin")).toBe(true);
    expect(canReviewQc(null)).toBe(false);
    // sellers and customers are NOT reviewers
    expect(canReviewQc("seller")).toBe(false);
    expect(canReviewQc("customer")).toBe(false);
  });

  it("non-reviewers cannot start or complete reviews", async () => {
    const review = await submitProductForQc("test-project", submitInput());
    const sellerActor = { uid: SELLER.uid, adminRole: null };
    await expect(
      startQcReview("test-project", review.reviewId, sellerActor),
    ).rejects.toThrow(/permission/);
    await expect(
      completeQcReview("test-project", { reviewId: review.reviewId, checklist: fullChecklist(true) }, sellerActor),
    ).rejects.toThrow(/permission/);
    // and the review is untouched
    expect((await readQcReview("test-project", review.reviewId)).status).toBe("PENDING_QC");
  });
});

describe("kernel bus stays decoupled from QC", () => {
  it("events emitted by QC are consumable by a platform subscriber", async () => {
    const seen: string[] = [];
    const { registerSubscriber, processDispatch } = await import("../../kernel/events");
    registerSubscriber({ name: "test-analytics", types: ["product.qc.passed", "product.qc.failed"], handler: async (e) => { seen.push(String((e.payload as Record<string, unknown>).productId)); } });

    const review = await submitProductForQc("test-project", submitInput());
    await startQcReview("test-project", review.reviewId, REVIEWER);
    await completeQcReview("test-project", { reviewId: review.reviewId, checklist: fullChecklist(true) }, REVIEWER);

    const res = await fetch(`${BASE}/domainDispatches`);
    const json = (await res.json()) as { documents?: Array<{ fields: Record<string, unknown> }>; };
    const dispatchIds = (json.documents ?? []).map((d) =>
      `${String((d.fields.subscriber as Record<string, unknown>).stringValue)}__${String((d.fields.eventId as Record<string, unknown>).stringValue)}`,
    );
    const analytics = dispatchIds.filter((d) => d.startsWith("test-analytics__"));
    expect(analytics.length).toBe(1);
    await processDispatch("test-project", analytics[0]);
    expect(seen).toEqual(["p1"]);
  });
});
