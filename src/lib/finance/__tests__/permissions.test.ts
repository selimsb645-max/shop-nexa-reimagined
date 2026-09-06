/**
 * AVENTA SHOP — Prompt 04 §12 TESTS: Finance permissions (§11).
 *
 * Support admin and content admin must NEVER touch finance — not even
 * read. Deny-by-default for every unlisted role.
 */

import { describe, it, expect } from "vitest";
import {
  FINANCE_PERMISSIONS, FINANCE_READ_ROLES,
  hasFinancePermission, canMutateFinance,
} from "../permissions";

describe("finance permissions (§11, §12 unauthorized access)", () => {
  it("super_admin and finance_admin hold ALL finance permissions", () => {
    for (const role of ["super_admin", "finance_admin"] as const) {
      for (const perm of FINANCE_PERMISSIONS as readonly ("finance.read" | "finance.review" | "finance.adjust" | "finance.settlement" | "finance.payout" | "finance.refund" | "finance.reconcile")[]) {
        expect(hasFinancePermission(role, perm)).toBe(true);
      }
      expect(canMutateFinance(role)).toBe(true);
    }
  });

  it("admin and order_manager are finance READ-ONLY", () => {
    expect(hasFinancePermission("admin", "finance.read")).toBe(true);
    expect(hasFinancePermission("order_manager", "finance.read")).toBe(true);
    for (const perm of ["finance.review", "finance.adjust", "finance.settlement", "finance.payout", "finance.refund", "finance.reconcile"] as const) {
      expect(hasFinancePermission("admin", perm)).toBe(false);
      expect(hasFinancePermission("order_manager", perm)).toBe(false);
    }
    expect(canMutateFinance("admin")).toBe(false);
  });

  it("support_admin and content_admin have ZERO finance permissions (not even read)", () => {
    for (const role of ["support_admin", "content_admin"]) {
      for (const perm of FINANCE_PERMISSIONS) {
        expect(hasFinancePermission(role, perm)).toBe(false);
      }
      expect(FINANCE_READ_ROLES).not.toContain(role);
      expect(canMutateFinance(role)).toBe(false);
    }
  });

  it("catalog, QC, marketing and every other role are deny-by-default", () => {
    for (const role of ["catalog_manager", "category_manager", "qc_manager", "marketing_admin", "seller", "customer", ""])
      for (const perm of FINANCE_PERMISSIONS) {
        expect(hasFinancePermission(role, perm)).toBe(false);
      }
  });

  it("null/undefined role never grants anything", () => {
    expect(hasFinancePermission(null, "finance.read")).toBe(false);
    expect(hasFinancePermission(undefined, "finance.payout")).toBe(false);
    expect(canMutateFinance(null)).toBe(false);
  });
});
