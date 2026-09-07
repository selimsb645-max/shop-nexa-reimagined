/**
 * Product QC state machine (Prompt 06 §3) — built on the kernel's
 * generic machine. A product may only be LISTED after QC passes;
 * failed products return to the seller with reasons, and the seller
 * may fix + resubmit (FAILED is NOT terminal for resubmission).
 */
import { defineMachine, canTransition, isTerminal, type StateMachine } from "../kernel/machine";

export type QcState =
  | "DRAFT" // seller is still preparing the product
  | "PENDING_QC" // seller submitted — waiting for a QC reviewer
  | "IN_QC" // a QC reviewer picked it up
  | "QC_PASSED" // checklist passed
  | "QC_FAILED" // checklist failed — reasons recorded
  | "LISTED" // live on the storefront
  | "UNLISTED"; // pulled from storefront (can go back to IN_QC)

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

// ───────────────────────────────────────────────────────────────
// Checklist metadata (client-safe — shared by seller + admin UI)
// Keys mirror QC_CHECKLIST in qc.server.ts exactly; a unit test
// asserts the two sets stay in sync.
// ───────────────────────────────────────────────────────────────

export interface QcChecklistMeta {
  key: string;
  /** Short label shown to reviewers. */
  label: string;
  /** Seller-facing guidance shown in the correction checklist. */
  sellerHint: string;
}

export const QC_CHECKLIST_META: QcChecklistMeta[] = [
  {
    key: "titleClear",
    label: "Title is clear and accurate",
    sellerHint: "Make the title specific, accurate and brand-correct — no misleading claims.",
  },
  {
    key: "photosReal",
    label: "Real product photos",
    sellerHint:
      "Upload clear, real photos of the actual product (at least one, no watermarks of other marketplaces).",
  },
  {
    key: "descriptionAccurate",
    label: "Description is accurate",
    sellerHint:
      "Write a complete description (min 10 characters) covering what the customer receives.",
  },
  {
    key: "priceSanePaisa",
    label: "Price is sane",
    sellerHint: "Set a realistic price for the category — not a placeholder like 1৳ or 999999৳.",
  },
  {
    key: "categoryCorrect",
    label: "Category is correct",
    sellerHint: "Choose the right category and subcategory so customers can find the product.",
  },
  {
    key: "stockCounted",
    label: "Stock matches reality",
    sellerHint:
      "Declare the real available stock — you must be able to fulfil the orders it generates.",
  },
  {
    key: "noProhibitedItems",
    label: "No prohibited items",
    sellerHint:
      "The product must comply with marketplace policy (no weapons, drugs, counterfeits, etc.).",
  },
];

export function qcChecklistLabel(key: string): string {
  return QC_CHECKLIST_META.find((m) => m.key === key)?.label ?? key;
}

export function qcChecklistHint(key: string): string {
  return QC_CHECKLIST_META.find((m) => m.key === key)?.sellerHint ?? "";
}
