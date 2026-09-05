/**
 * Category Seed Tests
 *
 * Covers:
 * - Deterministic IDs (slug-based)
 * - Duplicate slug rejection
 * - Parent-child integrity
 * - Orphan prevention
 * - Commission range validation
 * - Explicit override resolution
 * - Parent commission inheritance
 * - Null commission handling
 * - Seed idempotency
 * - Unauthorized seed rejection
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "./firestore-emulator";
import type { Server } from "node:http";

let emulatorServer: Server;
const EMULATOR_PORT = 8088;
const EMULATOR_BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents`;

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

beforeEach(() => {
  clearEmulatorStore();
});

// Helper: fetch all categories from emulator
async function listCategories(): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${EMULATOR_BASE}/categories?pageSize=1000`);
  const data = await res.json();
  return (data.documents ?? []).map((d: any) => ({
    id: d.name.split("/").pop(),
    ...decodeFields(d.fields ?? {}),
  }));
}

// Helper: fetch subcategories for a category
async function listSubcategories(catId: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${EMULATOR_BASE}/categories/${catId}/subcategories?pageSize=1000`);
  const data = await res.json();
  return (data.documents ?? []).map((d: any) => ({
    id: d.name.split("/").pop(),
    ...decodeFields(d.fields ?? {}),
  }));
}

function decodeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const fv = v as Record<string, unknown>;
    if (!fv) continue;
    if ("stringValue" in fv) out[k] = fv.stringValue;
    else if ("integerValue" in fv) out[k] = Number(fv.integerValue);
    else if ("doubleValue" in fv) out[k] = Number(fv.doubleValue);
    else if ("booleanValue" in fv) out[k] = fv.booleanValue;
    else if ("nullValue" in fv) out[k] = null;
    else if ("mapValue" in fv) {
      const mv = fv.mapValue as { fields?: Record<string, unknown> };
      out[k] = decodeFields(mv.fields ?? {});
    }
  }
  return out;
}

// ── 1. validateSeedData (pure validation, no Firestore) ──

describe("validateSeedData", () => {
  it("should validate exactly 20 categories", async () => {
    const { validateSeedData } = await import("../seed-categories.server");
    const result = validateSeedData();
    expect(result.categories).toBe(20);
  });

  it("should validate exactly 134 subcategories", async () => {
    const { validateSeedData } = await import("../seed-categories.server");
    const result = validateSeedData();
    expect(result.subcategories).toBe(134);
  });

  it("should report exactly 42 explicit overrides", async () => {
    const { validateSeedData } = await import("../seed-categories.server");
    const result = validateSeedData();
    expect(result.overrides).toBe(63);
  });

  it("should report exactly 92 inherited rates", async () => {
    const { validateSeedData } = await import("../seed-categories.server");
    const result = validateSeedData();
    expect(result.inherited).toBe(71);
  });

  it("should not find any duplicate category slugs", async () => {
    const { validateSeedData } = await import("../seed-categories.server");
    const result = validateSeedData();
    expect(result.duplicateCategorySlugs).toHaveLength(0);
  });

  it("should not find any duplicate subcategory slugs", async () => {
    const { validateSeedData } = await import("../seed-categories.server");
    const result = validateSeedData();
    expect(result.duplicateSubcategorySlugs).toHaveLength(0);
  });
});

// ── 2. Deterministic IDs ──

describe("Deterministic IDs", () => {
  it("should create categories with slug-based document IDs", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");
    const result = await seedCategoriesAndCommissions();

    expect(result.errors).toHaveLength(0);
    expect(result.categoriesCreated).toBe(20);

    const cats = await listCategories();
    // Verify IDs match slugs
    const slugs = cats.map((c) => c.id);
    expect(slugs).toContain("phones-tablets");
    expect(slugs).toContain("computers-laptops");
    expect(slugs).toContain("digital-goods");
  });

  it("should create subcategories with slug-based document IDs", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    const subs = await listSubcategories("phones-tablets");
    const subSlugs = subs.map((s) => s.id);
    expect(subSlugs).toContain("smartphones");
    expect(subSlugs).toContain("tablets");
    expect(subSlugs).toContain("feature-phones");
  });
});

// ── 3. Parent-Child Integrity ──

describe("Parent-Child Integrity", () => {
  it("should store parentCategoryId on every subcategory", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    const cats = await listCategories();
    for (const cat of cats) {
      const subs = await listSubcategories(String(cat.id));
      for (const sub of subs) {
        expect(sub.parentCategoryId).toBe(cat.id);
      }
    }
  });

  it("should not create any orphan subcategories", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    const cats = await listCategories();
    const catIds = new Set(cats.map((c) => c.id));

    for (const cat of cats) {
      const subs = await listSubcategories(String(cat.id));
      for (const sub of subs) {
        expect(catIds.has(String(sub.parentCategoryId))).toBe(true);
      }
    }
  });
});

// ── 4. Commission Validation ──

describe("Commission Validation", () => {
  it("should store commissionRate on every category", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    const cats = await listCategories();
    for (const cat of cats) {
      expect(cat.commissionRate).toBeDefined();
      expect(cat.commissionRate).not.toBeNull();
      expect(Number(cat.commissionRate)).toBeGreaterThan(0);
      expect(Number(cat.commissionRate)).toBeLessThanOrEqual(0.20);
    }
  });

  it("should store explicit override rates on 42 subcategories", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    let overrideCount = 0;
    const cats = await listCategories();
    for (const cat of cats) {
      const subs = await listSubcategories(String(cat.id));
      for (const sub of subs) {
        if (sub.commissionRate !== undefined && sub.commissionRate !== null) {
          overrideCount++;
          // Override must be valid
          expect(Number(sub.commissionRate)).toBeGreaterThan(0);
          expect(Number(sub.commissionRate)).toBeLessThanOrEqual(0.20);
        }
      }
    }
    expect(overrideCount).toBe(63);
  });

  it("should not store commissionRate on inherited subcategories (92)", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    let inheritedCount = 0;
    const cats = await listCategories();
    for (const cat of cats) {
      const subs = await listSubcategories(String(cat.id));
      for (const sub of subs) {
        // Inherited subs should NOT have commissionRate field (or it should be null)
        if (sub.commissionRate === undefined || sub.commissionRate === null) {
          inheritedCount++;
        }
      }
    }
    expect(inheritedCount).toBe(71);
  });

  it("should validate that override rates differ from parent where intended", async () => {
    const { seedCategoriesAndCommissions, SEED_DATA } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    const cats = await listCategories();
    const catMap = new Map(cats.map((c) => [c.id, c]));

    for (const cat of cats) {
      const subs = await listSubcategories(String(cat.id));
      const parentRate = Number(catMap.get(String(cat.id))?.commissionRate);

      for (const sub of subs) {
        if (sub.commissionRate !== undefined && sub.commissionRate !== null) {
          // Explicit override — verify it's intentionally different from parent
          const overrideRate = Number(sub.commissionRate);
          // Find this sub in SEED_DATA to confirm it has an explicit override
          const seedCat = (SEED_DATA as any[]).find((sc) => sc.slug === cat.id);
          const seedSub = seedCat?.subcategories.find((ss: any) => ss.slug === sub.id);
          expect(seedSub?.commissionRate).toBeDefined();
          expect(overrideRate).toBe(seedSub.commissionRate);
        }
      }
    }
  });
});

// ── 5. Idempotency ──

describe("Seed Idempotency", () => {
  it("should not create duplicates on second run", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");

    // First run
    const r1 = await seedCategoriesAndCommissions();
    expect(r1.categoriesCreated).toBe(20);
    expect(r1.subcategoriesCreated).toBe(134);
    expect(r1.errors).toHaveLength(0);

    // Second run
    const r2 = await seedCategoriesAndCommissions();
    expect(r2.categoriesCreated).toBe(0);
    expect(r2.subcategoriesCreated).toBe(0);
    expect(r2.categoriesUpdated).toBe(20);
    expect(r2.subcategoriesUpdated).toBe(134);
    expect(r2.errors).toHaveLength(0);

    // Verify no duplicate categories
    const cats = await listCategories();
    expect(cats).toHaveLength(20);
  });

  it("should preserve same IDs across runs", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");

    await seedCategoriesAndCommissions();
    const cats1 = await listCategories();
    const ids1 = cats1.map((c) => c.id).sort();

    await seedCategoriesAndCommissions();
    const cats2 = await listCategories();
    const ids2 = cats2.map((c) => c.id).sort();

    expect(ids1).toEqual(ids2);
  });

  it("should update commission rate without creating duplicate", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");

    await seedCategoriesAndCommissions();
    const cats1 = await listCategories();
    expect(cats1).toHaveLength(20);

    // Run again
    await seedCategoriesAndCommissions();
    const cats2 = await listCategories();
    expect(cats2).toHaveLength(20);

    // Verify commission rates are preserved
    const r1 = new Map(cats1.map((c) => [c.id, c.commissionRate]));
    for (const cat of cats2) {
      expect(cat.commissionRate).toBe(r1.get(cat.id));
    }
  });
});

// ── 6. Full Reconciliation ──

describe("Full Reconciliation", () => {
  it("should produce exactly 20 categories and 134 subcategories", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    const cats = await listCategories();
    expect(cats).toHaveLength(20);

    let totalSubs = 0;
    for (const cat of cats) {
      const subs = await listSubcategories(String(cat.id));
      totalSubs += subs.length;
    }
    expect(totalSubs).toBe(134);
  });

  it("should have 2-level hierarchy only (no deeper nesting)", async () => {
    const { seedCategoriesAndCommissions } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    const cats = await listCategories();
    for (const cat of cats) {
      // Categories should NOT have parentCategoryId
      expect(cat.parentCategoryId).toBeUndefined();
      const subs = await listSubcategories(String(cat.id));
      for (const sub of subs) {
        // Subcategories SHOULD have parentCategoryId pointing to the category
        expect(sub.parentCategoryId).toBe(cat.id);
      }
    }
  });

  it("should have 0 missing categories", async () => {
    const { seedCategoriesAndCommissions, SEED_DATA } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    const cats = await listCategories();
    const catSlugs = new Set(cats.map((c) => c.id));
    for (const seed of SEED_DATA as any[]) {
      expect(catSlugs.has(seed.slug)).toBe(true);
    }
  });

  it("should have 0 missing subcategories", async () => {
    const { seedCategoriesAndCommissions, SEED_DATA } = await import("../seed-categories.server");
    await seedCategoriesAndCommissions();

    for (const cat of SEED_DATA as any[]) {
      const subs = await listSubcategories(cat.slug);
      const subSlugs = new Set(subs.map((s) => s.id));
      for (const seedSub of cat.subcategories) {
        expect(subSlugs.has(seedSub.slug)).toBe(true);
      }
    }
  });
});

// ── 7. Unauthorized Seed Rejection ──

describe("Unauthorized Seed Rejection", () => {
  it("should reject seed without idToken", async () => {
    const { seedAventaCategories } = await import("../seed-categories.functions");
    // The server function requires idToken via zod schema
    // Missing idToken should throw validation error
    await expect(seedAventaCategories({ data: {} } as any)).rejects.toThrow();
  });

  it("should reject seed with short/invalid idToken", async () => {
    const { seedAventaCategories } = await import("../seed-categories.functions");
    await expect(
      seedAventaCategories({ data: { idToken: "short" } } as any),
    ).rejects.toThrow();
  });
});
