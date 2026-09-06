/**
 * Product QC state machine (Prompt 06 §3) — built on the kernel's
 * generic machine. A product may only be LISTED after QC passes;
 * failed products return to the seller with reasons, and the seller
 * may fix + resubmit (FAILED is NOT terminal for resubmission).
 */
import { defineMachine, canTransition, isTerminal, type StateMachine } from "../kernel/machine";

export type QcState =
  | "DRAFT"           // seller is still preparing the product
  | "PENDING_QC"      // seller submitted — waiting for a QC reviewer
  | "IN_QC"           // a QC reviewer picked it up
  | "QC_PASSED"       // checklist passed
  | "QC_FAILED"       // checklist failed — reasons recorded
  | "LISTED"          // live on the storefront
  | "UNLISTED";       // pulled from storefront (can go back to IN_QC)

export const QC_MACHINE: StateMachine<QcState> = defineMachine<QcState>(
  ["DRAFT", "PENDING_QC", "IN_QC", "QC_PASSED", "QC_FAILED", "LISTED", "UNLISTED"],
  {
    DRAFT: ["PENDING_QC"],
    PENDING_QC: ["IN_QC", "QC_FAILED"],
    IN_QC: ["QC_PASSED", "QC_FAILED"],
    QC_PASSED: ["LISTED"],
    // seller fixed the issues → back through the queue
    QC_FAILED: ["PENDING_QC"],
    LISTED: ["UNLISTED"],
    UNLISTED: ["LISTED", "IN_QC"],
  },
  // none terminal: products keep living; UNLISTED can always relist
  [],
);

export function isValidQcTransition(from: QcState, to: QcState): boolean {
  return canTransition(QC_MACHINE, from, to);
}

export function isTerminalQcState(state: QcState): boolean {
  return isTerminal(QC_MACHINE, state);
}

/** Seller-facing statuses where submissions/resubmissions are accepted. */
export function allowsSellerQcActions(state: QcState): boolean {
  return state === "DRAFT" || state === "QC_FAILED";
}

export const QC_STATE_LABELS: Record<QcState, string> = {
  DRAFT: "Draft",
  PENDING_QC: "Pending QC",
  IN_QC: "In QC",
  QC_PASSED: "QC Passed",
  QC_FAILED: "QC Failed",
  LISTED: "Listed",
  UNLISTED: "Unlisted",
};
