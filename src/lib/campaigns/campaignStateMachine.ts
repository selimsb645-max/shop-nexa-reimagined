/**
 * AVENTA SHOP — Campaign State Machine (Prompt 05 §2)
 *
 * Canonical lifecycle:
 *
 *   DRAFT → SUBMITTED → REVIEW → APPROVED → SCHEDULED → ACTIVE → ENDED
 *
 * Exception paths:
 *
 *   REJECTED  (terminal — from DRAFT/SUBMITTED/REVIEW)
 *   CANCELLED (terminal — from any non-terminal state)
 *   PAUSED    (recoverable — only while ACTIVE/SCHEDULED; resumes to ACTIVE)
 *
 * The matrix is the single source of truth mirrored by:
 *   - the server transition engine (campaigns.server.ts)
 *   - Firestore rules (transition validation, admin panel writes)
 *   - the admin panel UI (allowed actions per status)
 */
export type CampaignState =
  | "DRAFT"
  | "SUBMITTED"
  | "REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "ACTIVE"
  | "ENDED"
  | "REJECTED"
  | "CANCELLED"
  | "PAUSED";

export const CAMPAIGN_STATES = [
  "DRAFT",
  "SUBMITTED",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "ACTIVE",
  "ENDED",
  "REJECTED",
  "CANCELLED",
  "PAUSED",
] as const;

/** Valid transitions. Self-transitions (no-op writes) are always allowed. */
export const CAMPAIGN_TRANSITIONS: Record<CampaignState, CampaignState[]> = {
  DRAFT: ["SUBMITTED", "REVIEW", "REJECTED", "CANCELLED"],
  SUBMITTED: ["REVIEW", "REJECTED", "CANCELLED"],
  REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["ACTIVE", "CANCELLED", "PAUSED"],
  ACTIVE: ["PAUSED", "ENDED", "CANCELLED"],
  PAUSED: ["ACTIVE", "ENDED", "CANCELLED"],
  ENDED: [], // terminal
  REJECTED: [], // terminal
  CANCELLED: [], // terminal
};

export function isValidCampaignTransition(from: CampaignState, to: CampaignState): boolean {
  if (from === to) return true; // idempotent no-op
  return CAMPAIGN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertCampaignTransition(from: CampaignState, to: CampaignState): void {
  if (!isValidCampaignTransition(from, to)) {
    throw new Error(`campaigns/transition: illegal transition ${from} → ${to}`);
  }
}

export function isTerminalCampaignState(s: CampaignState): boolean {
  return CAMPAIGN_TRANSITIONS[s].length === 0;
}

/** States in which sellers may submit products for the campaign (§3). */
export const SELLER_SUBMISSION_STATES: readonly CampaignState[] = [
  "SUBMITTED",
  "REVIEW",
] as const;

export function allowsSellerSubmissions(s: CampaignState): boolean {
  return (SELLER_SUBMISSION_STATES as readonly string[]).includes(s);
}
