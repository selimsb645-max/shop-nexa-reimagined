/**
 * AVENTA CORE — Kernel: shared audit envelope (Prompt 06 §2)
 *
 * One append-only audit collection for the whole platform. Campaigns
 * (campaignEvents), orders (auditHandler) and finance keep their own
 * domain-scoped trails (they are working and stay untouched); the
 * kernel trail is the cross-domain backbone record: every domain
 * event ALSO lands here with the same shape, so a single query can
 * reconstruct "who did what, when" across PRODUCT → ORDER → CAMPAIGN
 * → FINANCE.
 *
 * Rules: service-account + campaign-manager read only; never updated,
 * never deleted (append-only enforced by rule).
 */

import { docPath, toFsFields, commitWrites } from "../firebase-admin.server";
import type { EventActor } from "./events";

export type { EventActor } from "./events";

export const KERNEL_AUDIT_COLLECTION = "auditTrail";

export interface AuditEntry {
  actor: EventActor;
  /** e.g. "qc.passed" | "campaign.activated" | "order.transitioned" */
  action: string;
  /** e.g. "products/p123" */
  target: string;
  /** Structured, JSON-safe context (before/after, reason, …). */
  meta?: Record<string, unknown>;
}

export function auditDocId(target: string, action: string, ts: number, salt: string): string {
  const safeTarget = target.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeTarget}__${action.replace(/\./g, "_")}__${ts}_${salt}`;
}

/** Append one audit entry. Fire-and-forget safe: never throws upward?  *
 *  NO — audit is a compliance record; a failure must be visible.       */
export async function appendAuditEntry(projectId: string, entry: AuditEntry): Promise<string> {
  const ts = Date.now();
  const docId = auditDocId(entry.target, entry.action, ts, Math.random().toString(36).slice(2, 8));
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [KERNEL_AUDIT_COLLECTION, docId]),
        fields: toFsFields({
          actorId: entry.actor.id,
          actorRole: entry.actor.role ?? null,
          action: entry.action,
          target: entry.target,
          meta: JSON.stringify(entry.meta ?? {}),
          ts,
        }),
      },
    },
  ]);
  return docId;
}
