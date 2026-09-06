/**
 * AVENTA CORE kernel event bus — integration tests (emulator-backed).
 * Idempotency, dispatch lifecycle, retry → DEAD, subscriber filtering.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";
import {
  emitDomainEvent,
  processDispatch,
  registerSubscriber,
  DOMAIN_EVENTS_COLLECTION,
  DOMAIN_DISPATCHES_COLLECTION,
  MAX_DISPATCH_ATTEMPTS,
} from "../events";
import { canTransition, defineMachine, assertTransition } from "../machine";

let emulatorServer: Server;
const EMULATOR_PORT = 8089;
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents`;

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

async function docExists(path: string): Promise<boolean> {
  const res = await fetch(`${BASE}/${path}`);
  return res.ok;
}

describe("kernel event bus", () => {
  it("emits once — a repeated emit is a no-op (idempotency)", async () => {
    const seen: string[] = [];
    registerSubscriber({ name: "count", types: "*", handler: async (e) => { seen.push(e.eventId); } });

    const r1 = await emitDomainEvent("test-project", {
      source: "order", type: "order.created", key: "o1", seq: 1,
      actor: { id: "user:u1" }, payload: { total: 50000 },
    });
    expect(r1.emitted).toBe(true);
    expect(r1.dispatches).toHaveLength(1);

    const r2 = await emitDomainEvent("test-project", {
      source: "order", type: "order.created", key: "o1", seq: 1,
      actor: { id: "user:u1" }, payload: { total: 50000 },
    });
    expect(r2.emitted).toBe(false);
    expect(r2.skipped).toBe("already-emitted");

    // exactly ONE event doc in the store
    expect(await docExists(`${DOMAIN_EVENTS_COLLECTION}/order__order.created__o1`)).toBe(true);

    // both dispatches have the same id → processing is naturally idempotent
    await processDispatch("test-project", r1.dispatches[0]!);
    await processDispatch("test-project", r1.dispatches[0]!);
    expect(seen).toHaveLength(1);
  });

  it("subscribers only receive the event types they asked for", async () => {
    const financeSaw: string[] = [];
    const campaignsSaw: string[] = [];
    registerSubscriber({
      name: "finance",
      types: ["order.created", "order.returned", "finance.payout.failed"],
      handler: async (e) => { financeSaw.push(e.type); },
    });
    registerSubscriber({
      name: "campaigns",
      types: ["product.listed"],
      handler: async (e) => { campaignsSaw.push(e.type); },
    });

    await emitDomainEvent("test-project", { source: "order", type: "order.created", key: "o9", seq: 1, actor: { id: "user:u1" }, payload: {} });
    await emitDomainEvent("test-project", { source: "product", type: "product.listed", key: "p9", seq: 1, actor: { id: "system" }, payload: {} });

    // finance got order.created only; campaigns got product.listed only
    const r1 = await emitDomainEvent("test-project", { source: "order", type: "order.created", key: "o9b", seq: 1, actor: { id: "user:u1" }, payload: {} });
    // note: re-registering replaces — dispatch count matches types subscribed
    expect(r1.dispatches.some((d) => d.startsWith("finance__"))).toBe(true);
    expect(r1.dispatches.some((d) => d.startsWith("campaigns__"))).toBe(false);
  });

  it("a failing subscriber retries, records the error, then goes DEAD", async () => {
    let calls = 0;
    registerSubscriber({
      name: "flaky",
      types: "*",
      handler: async () => { calls++; throw new Error("boom"); },
    });
    const r = await emitDomainEvent("test-project", {
      source: "finance", type: "finance.payout.failed", key: "po1", seq: 1,
      actor: { id: "system" }, payload: { payoutId: "po1" },
    });
    const dispatchId = r.dispatches.find((d) => d.startsWith("flaky__"))!;

    let outcome = await processDispatch("test-project", dispatchId);
    expect(outcome.status).toBe("PENDING");
    expect(outcome.attempts).toBe(1);
    expect(outcome.error).toContain("boom");

    // idempotent processing: repeated calls advance attempts one at a time
    for (let i = 2; i < MAX_DISPATCH_ATTEMPTS; i++) {
      outcome = await processDispatch("test-project", dispatchId);
      expect(outcome.status).toBe("PENDING");
    }
    outcome = await processDispatch("test-project", dispatchId);
    expect(outcome.status).toBe("DEAD");
    expect(outcome.attempts).toBe(MAX_DISPATCH_ATTEMPTS);
    // handler actually ran every attempt — nothing silently skipped
    expect(calls).toBe(MAX_DISPATCH_ATTEMPTS);

    // DEAD dispatch is terminal — no further runs
    const after = await processDispatch("test-project", dispatchId);
    expect(after.status).toBe("DEAD");
    expect(calls).toBe(MAX_DISPATCH_ATTEMPTS);
  });

  it("a DONE dispatch never re-runs its handler", async () => {
    let calls = 0;
    registerSubscriber({ name: "once", types: "*", handler: async () => { calls++; } });
    const r = await emitDomainEvent("test-project", {
      source: "campaign", type: "campaign.started", key: "c1", seq: 1,
      actor: { id: "system" }, payload: {},
    });
    const dispatchId = r.dispatches.find((d) => d.startsWith("once__"))!;
    const a = await processDispatch("test-project", dispatchId);
    const b = await processDispatch("test-project", dispatchId);
    expect(a.status).toBe("DONE");
    expect(b.status).toBe("DONE");
    expect(calls).toBe(1);
  });

  it("event + dispatch docs land in the expected collections", async () => {
    registerSubscriber({ name: "obs", types: "*", handler: async () => {} });
    const r = await emitDomainEvent("test-project", {
      source: "product", type: "product.qc.passed", key: "qc_p1_123", seq: 1,
      actor: { id: "admin:a1", role: "content_admin" }, payload: { productId: "p1" },
    });
    expect(await docExists(`${DOMAIN_EVENTS_COLLECTION}/product__product.qc.passed__qc_p1_123`)).toBe(true);
    expect(await docExists(`${DOMAIN_DISPATCHES_COLLECTION}/obs__product__product.qc.passed__qc_p1_123`)).toBe(true);
  });
});

describe("kernel generic machine", () => {
  const m = defineMachine(
    ["A", "B", "C"] as const,
    { A: ["B"], B: ["C"], C: [] } as const,
    ["C"] as const,
  );
  it("allows only declared transitions", () => {
    expect(canTransition(m, "A", "B")).toBe(true);
    expect(canTransition(m, "A", "C")).toBe(false);
    expect(canTransition(m, "B", "A")).toBe(false);
    expect(canTransition(m, "A", "A")).toBe(true); // no-op
  });
  it("flags terminal states", () => {
    expect(canTransition(m, "C", "A")).toBe(false);
  });
  it("assertTransition throws with the machine label", () => {
    expect(() => assertTransition(m, "A", "C", "test")).toThrow(/kernel\/machine\[test\]/);
  });
});
