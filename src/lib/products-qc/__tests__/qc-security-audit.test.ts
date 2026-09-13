/**
 * Product QC — security audit tests.
 *
 * Complements the emulator-backed flow tests (qc.server.test.ts) with
 * rule-level and transport-level assertions from the QC module spec:
 *   - sellers can never self-publish (status → published blocked in rules)
 *   - new seller products must enter as drafts, unapproved
 *   - qcReviews / auditTrail / domainEvents are server-only collections
 *   - the client checklist metadata stays in sync with the server checklist
 *   - the transport layer verifies ownership + admin role server-side
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { QC_CHECKLIST_META } from "../qcStateMachine";

const rules = readFileSync("firestore.rules", "utf-8");

/** Server module source — parsed for structural assertions (no emulator needed). */
const qcServer = readFileSync("src/lib/products-qc/qc.server.ts", "utf-8");
const qcFunctions = readFileSync("src/lib/products-qc/qc.functions.ts", "utf-8");

describe("Product QC — Firestore rules hardening", () => {
  it("blocks sellers from flipping a product's status to published", () => {
    // The seller update branch must contain the QC bypass guard.
    const guard =
      "!('status' in request.resource.data.diff(resource.data).affectedKeys()'\n" +
      "               && request.resource.data.status == 'published')";
    expect(rules).toContain(
      "&& !('status' in request.resource.data.diff(resource.data).affectedKeys()",
    );
    expect(rules).toContain("&& request.resource.data.status == 'published'");
  });

  it("still lets sellers edit published products without touching status", () => {
    // Guard is diff-aware: editing a legacy published product (status not in
    // affectedKeys) must remain allowed — check the guard is inside the
    // condition, not an unconditional status != 'published' requirement.
    expect(rules).not.toMatch(
      /isApprovedSeller\(\)[\s\S]{0,400}\|\| request\.resource\.data\.status == 'published'/,
    );
  });

  it("forces new seller products into the QC pipeline (draft + unapproved)", () => {
    const createBranch = rules.match(/isApprovedSeller\(\)[\s\S]{0,300}?\)\);/)?.[0];
    expect(createBranch).toContain("request.resource.data.approved == false");
    expect(createBranch).toContain("request.resource.data.status == 'draft'");
  });

  it("keeps qcReviews server-only (no client writes, seller can read own)", () => {
    const qcBlock = rules.slice(rules.indexOf("match /qcReviews/"));
    expect(qcBlock).toContain("allow create, update, delete: if false");
    expect(qcBlock).toContain(
      "roleIn(['super_admin', 'admin', 'platform_admin', 'content_admin', 'support_admin'])",
    );
    expect(qcBlock).toContain("resource.data.sellerUid == request.auth.uid");
  });

  it("keeps the audit trail append-only and event bus server-written", () => {
    const auditBlock = rules.slice(rules.indexOf("match /auditTrail/"));
    expect(auditBlock).toContain("allow update, delete: if false");
    expect(rules).toContain("match /domainEvents/{eventId}");
  });
});

describe("Product QC — client/server contract", () => {
  it("checklist metadata keys match the server checklist exactly", async () => {
    // Import the server checklist without triggering firebase-admin init:
    // extract the QC_CHECKLIST literal from source.
    const literal = qcServer.match(/QC_CHECKLIST = \[([\s\S]*?)\] as const/)?.[1] ?? "";
    const serverKeys = [...literal.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    const uniqueServerKeys = [...new Set(serverKeys)];
    expect(uniqueServerKeys.length).toBeGreaterThan(0);
    const metaKeys = QC_CHECKLIST_META.map((m: { key: string }) => m.key);
    expect(uniqueServerKeys.sort()).toEqual(metaKeys.sort());
  });

  it("every QC transition that changes visibility syncs the product doc in the same commit", () => {
    // submit forces draft+unapproved; LISTED publishes; failure/unlist hide.
    expect(qcServer).toContain(`toFsFields({ status: "draft", approved: false, updatedAt: now })`);
    expect(qcServer).toContain('productPatch: { approved: true, status: "published" }');
    expect(qcServer).toContain('productPatch: { approved: false, status: "draft" }');
  });

  it("seller notifications are written atomically with QC transitions", () => {
    expect(qcServer).toMatch(/"sellers",\s*\n\s*input\.sellerUid,\s*\n\s*"notifications",/);
    expect(qcServer).toMatch(/"sellers",\s*\n\s*review\.sellerUid,\s*\n\s*"notifications",/);
    expect(qcServer).toContain("`${reviewId}_SUBMITTED_${now}`");
    expect(qcServer).toContain('"product_approved"');
    expect(qcServer).toContain('"product_rejected"');
  });

  it("transport layer authorizes server-side: ownership for sellers, admin role for reviewers", () => {
    // Seller submit must verify product ownership against the doc.
    expect(qcFunctions).toContain('String(d.sellerId ?? "") !== uid');
    // Reviewer actions must resolve the caller's admin role from users/{uid}.
    expect(qcFunctions).toContain('docPath(projectId, ["users", uid])');
    expect(qcFunctions).toContain('role !== "admin" || blocked');
  });

  it("rejection always carries an explanatory note (no silent rejections)", () => {
    expect(qcServer).toContain("qc/complete: rejection requires a reviewer note explaining why");
  });
});
