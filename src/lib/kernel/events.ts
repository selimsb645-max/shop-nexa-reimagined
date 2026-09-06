/**
 * AVENTA CORE — Kernel: typed domain event bus (Prompt 06 §2)
 *
 * The single backbone that connects PRODUCT → ORDER → CAMPAIGN →
 * FINANCE → LEDGER → SETTLEMENT. Every domain transition emits one
 * typed envelope; subscribers (finance, inventory, notifications,
 * analytics, campaigns) consume idempotently.
 *
 * Transport: Firestore documents (same proven pattern as orderEvents
 * and the finance repair queue). No Kafka, no Redis — Firebase is the
 * backend (development rules §architecture).
 *
 * IDEMPOTENCY (the rule that makes the bus safe):
 *   1. Each event doc id is deterministic: `${source}__${type}__${key}`
 *      → a repeated emit for the same logical event NEVER creates a
 *      second doc and never re-runs subscribers.
 *   2. Each (event, subscriber) pair gets a deterministic dispatch doc
 *      → a subscriber crash mid-processing is retried safely.
 *   3. Failures increment `attempts`; after MAX_ATTEMPTS the dispatch
 *      is marked DEAD — it never silently disappears (§error handling).
 */

import type { FsWrite } from "../firebase-admin.server";
import {
  docPath,
  toFsFields,
  batchGetDocs,
  commitWrites,
} from "../firebase-admin.server";

// ───────────────────────────────────────────────────────────────
// Envelope
// ───────────────────────────────────────────────────────────────

/** Canonical event types across the whole platform. */
export type DomainEventType =
  // product lifecycle
  | "product.created"
  | "product.qc.passed"
  | "product.qc.failed"
  | "product.listed"
  | "product.updated"
  | "product.unlisted"
  // order lifecycle (mirrors OrderEventType)
  | "order.created"
  | "order.payment_confirmed"
  | "order.cancelled"
  | "order.delivered"
  | "order.returned"
  // campaign lifecycle
  | "campaign.scheduled"
  | "campaign.started"
  | "campaign.ending"
  | "campaign.ended"
  | "campaign.home_switched"
  | "campaign.home_restored"
  // finance lifecycle
  | "finance.settlement.created"
  | "finance.settlement.released"
  | "finance.payout.completed"
  | "finance.payout.failed"
  | "finance.payout.reversed";

/** Who caused the event — the same actor shape as campaigns/finance. */
export interface EventActor {
  /** "user:<uid>" | "seller:<uid>" | "admin:<uid>" | "system" */
  id: string;
  role?: string | null;
}

export interface DomainEvent<TPayload = unknown> {
  /** Deterministic id — the idempotency key. */
  eventId: string;
  type: DomainEventType;
  /** "order" | "product" | "campaign" | "finance" */
  source: string;
  /** Logical occurrence number within the source (per-type sequence). */
  seq: number;
  actor: EventActor;
  payload: TPayload;
  occurredAt: number;
}

export const DOMAIN_EVENTS_COLLECTION = "domainEvents";
export const DOMAIN_DISPATCHES_COLLECTION = "domainDispatches";
export const MAX_DISPATCH_ATTEMPTS = 8;

// ───────────────────────────────────────────────────────────────
// Idempotency helpers
// ───────────────────────────────────────────────────────────────

/** Deterministic event id: same logical event → same doc, always. */
export function domainEventId(source: string, type: DomainEventType, key: string): string {
  return `${source}__${type}__${key}`;
}

// ───────────────────────────────────────────────────────────────
// Subscribers
// ───────────────────────────────────────────────────────────────

export type SubscriberHandler = (event: DomainEvent) => Promise<void>;

export interface Subscriber {
  /** Stable name — becomes part of the deterministic dispatch id. */
  name: string;
  /** Which event types this subscriber cares about ("*" = all). */
  types: DomainEventType[] | "*";
  handler: SubscriberHandler;
}

const registry = new Map<string, Subscriber>();

/** Register a subscriber (idempotent by name — re-register replaces). */
export function registerSubscriber(sub: Subscriber): void {
  registry.set(sub.name, sub);
}

export function listSubscribers(): Subscriber[] {
  return Array.from(registry.values());
}

// ───────────────────────────────────────────────────────────────
// Emit + dispatch
// ───────────────────────────────────────────────────────────────

export interface EmitResult {
  eventId: string;
  emitted: boolean;
  /** Subscriber dispatches enqueued (name → dispatch doc id). */
  dispatches: string[];
  skipped?: "already-emitted";
}

/**
 * Emit a domain event and enqueue one dispatch doc per matching
 * subscriber. Idempotent: re-emitting the same logical event is a
 * no-op (the event doc already exists).
 */
export async function emitDomainEvent<TPayload>(
  projectId: string,
  input: {
    source: string;
    type: DomainEventType;
    /** Unique logical key for this occurrence (e.g. orderId). */
    key: string;
    seq: number;
    actor: EventActor;
    payload: TPayload;
  },
): Promise<EmitResult> {
  const eventId = domainEventId(input.source, input.type, input.key);
  const eventName = docPath(projectId, [DOMAIN_EVENTS_COLLECTION, eventId]);

  const existing = (await batchGetDocs(projectId, [eventName])).get(eventName);
  if (existing?.exists) {
    return { eventId, emitted: false, dispatches: [], skipped: "already-emitted" };
  }

  const now = Date.now();
  const event: DomainEvent<TPayload> = {
    eventId,
    type: input.type,
    source: input.source,
    seq: input.seq,
    actor: input.actor,
    payload: input.payload,
    occurredAt: now,
  };

  // Event doc + one dispatch doc per matching subscriber, atomically.
  const writes: FsWrite[] = [
    {
      update: {
        name: eventName,
        fields: toFsFields({
          eventId,
          type: input.type,
          source: input.source,
          seq: input.seq,
          actorId: input.actor.id,
          actorRole: input.actor.role ?? null,
          payload: JSON.stringify(input.payload),
          occurredAt: now,
        }),
      },
    },
  ];

  const dispatches: string[] = [];
  for (const sub of registry.values()) {
    if (sub.types !== "*" && !sub.types.includes(input.type)) continue;
    const dispatchId = `${sub.name}__${eventId}`;
    dispatches.push(dispatchId);
    writes.push({
      update: {
        name: docPath(projectId, [DOMAIN_DISPATCHES_COLLECTION, dispatchId]),
        fields: toFsFields({
          subscriber: sub.name,
          eventId,
          eventType: input.type,
          eventSource: input.source,
          payload: JSON.stringify(input.payload),
          status: "PENDING",
          attempts: 0,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
    });
  }

  await commitWrites(projectId, writes);
  return { eventId, emitted: true, dispatches };
}

export interface DispatchOutcome {
  dispatchId: string;
  subscriber: string;
  status: "DONE" | "PENDING" | "DEAD";
  attempts: number;
  error?: string;
}

/**
 * Process one dispatch. Idempotent + crash-safe:
 * DONE → no-op; PENDING → run handler, mark DONE on success;
 * failure → attempts++, retry while attempts < MAX; then DEAD.
 * The payload is read from the dispatch doc itself, so a restart
 * after a crash replays exactly the same input.
 */
export async function processDispatch(projectId: string, dispatchId: string): Promise<DispatchOutcome> {
  const name = docPath(projectId, [DOMAIN_DISPATCHES_COLLECTION, dispatchId]);
  const doc = (await batchGetDocs(projectId, [name])).get(name);
  if (!doc?.exists) throw new Error(`kernel/dispatch: ${dispatchId} not found`);
  const d = doc.data as Record<string, unknown>;

  const status = String(d.status ?? "PENDING");
  const attempts = Number(d.attempts ?? 0);
  if (status === "DONE" || status === "DEAD") {
    return { dispatchId, subscriber: String(d.subscriber ?? ""), status: status as "DONE" | "DEAD", attempts };
  }

  const subscriberName = String(d.subscriber ?? "");
  const sub = registry.get(subscriberName);
  if (!sub) {
    throw new Error(`kernel/dispatch: subscriber ${subscriberName} is not registered`);
  }

  const event: DomainEvent = {
    eventId: String(d.eventId ?? ""),
    type: String(d.eventType ?? "") as DomainEventType,
    source: String(d.eventSource ?? ""),
    seq: 0,
    actor: { id: "system" },
    payload: JSON.parse(String(d.payload ?? "null")),
    occurredAt: Number(d.createdAt ?? 0),
  };

  try {
    await sub.handler(event);
  } catch (err) {
    const nextAttempts = attempts + 1;
    const dead = nextAttempts >= MAX_DISPATCH_ATTEMPTS;
    await commitWrites(projectId, [{
      update: {
        name,
        fields: toFsFields({
          status: dead ? "DEAD" : "PENDING",
          attempts: nextAttempts,
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: Date.now(),
        }),
      },
    }]);
    return {
      dispatchId, subscriber: subscriberName,
      status: dead ? "DEAD" : "PENDING",
      attempts: nextAttempts,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await commitWrites(projectId, [{
    update: {
      name,
      fields: toFsFields({ status: "DONE", attempts, updatedAt: Date.now() }),
    },
  }]);
  return { dispatchId, subscriber: subscriberName, status: "DONE", attempts };
}

// ───────────────────────────────────────────────────────────────
// Sweep — process due dispatches (cron / lazy-trigger entrypoint)
// ───────────────────────────────────────────────────────────────

import { runFirestoreQuery } from "../firebase-admin.server";
import { fromFsValue, type FsValue } from "../firebase-admin.server";

/**
 * List PENDING (or DEAD, when `includeDead`) dispatch docs, oldest
 * first — the work queue for the platform's heartbeat.
 */
export async function listDueDispatches(
  projectId: string,
  limit = 50,
  includeDead = false,
): Promise<Array<{ dispatchId: string; status: string; attempts: number; eventType: string }>> {
  const statusFilter = includeDead
    ? undefined
    : { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "PENDING" } } };
  const rows = await runFirestoreQuery(projectId, {
    from: [{ collectionId: DOMAIN_DISPATCHES_COLLECTION }],
    ...(statusFilter ? { where: statusFilter } : {}),
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
    limit,
  });
  return rows
    .map((row) => {
      const doc = (row as Record<string, unknown>).document as
        | { name?: string; fields?: Record<string, FsValue> }
        | undefined;
      if (!doc?.name || !doc.fields) return null;
      const dispatchId = doc.name.split("/").pop() ?? "";
      const f = doc.fields;
      return {
        dispatchId,
        status: String(fromFsValue(f.status ?? { stringValue: "PENDING" })),
        attempts: Number(fromFsValue(f.attempts ?? { integerValue: 0 })),
        eventType: String(fromFsValue(f.eventType ?? { stringValue: "" })),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

export interface SweepResult {
  processed: number;
  done: number;
  retried: number;
  dead: number;
  errors: string[];
}

/**
 * Heartbeat: run every due dispatch. Safe to call from a cron sweep,
 * from a lazy trigger after any emit, or manually from an admin tool —
 * DONE dispatches no-op, failures advance attempts, DEAD is skipped
 * unless `includeDead` (then it gets one final attempt that can only
 * land DEAD again — never resurrects silently).
 */
export async function processDueDispatches(
  projectId: string,
  opts: { limit?: number; includeDead?: boolean } = {},
): Promise<SweepResult> {
  const limit = opts.limit ?? 50;
  const due = await listDueDispatches(projectId, limit, opts.includeDead ?? false);
  const result: SweepResult = { processed: 0, done: 0, retried: 0, dead: 0, errors: [] };
  for (const d of due) {
    try {
      const outcome = await processDispatch(projectId, d.dispatchId);
      result.processed++;
      if (outcome.status === "DONE") result.done++;
      else if (outcome.status === "DEAD") { result.dead++; result.errors.push(`${d.dispatchId}: ${outcome.error ?? "dead"}`); }
      else { result.retried++; if (outcome.error) result.errors.push(`${d.dispatchId}: ${outcome.error}`); }
    } catch (err) {
      result.errors.push(`${d.dispatchId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
