/**
 * AVENTA SHOP — Category & Commission Seeding Function
 *
 * Creates all 20 approved top-level categories and 134 subcategories
 * in Firestore with their approved AVENTA commission rates.
 *
 * Commission rates = 50% of Daraz "New Commission Rate" (PK Commission Rates - May 2026)
 *
 * SECURITY: Admin-only. Uses Firebase Admin SDK to bypass security rules.
 * This is a one-time seeding function — safe to call repeatedly (idempotent for
 * categories that already exist with the same slug).
 *
 * Idempotency guarantees:
 * - Deterministic slug-based document IDs (slug becomes the doc ID)
 * - Running twice updates existing docs, never creates duplicates
 * - Subcategories include explicit parentCategoryId reference
 * - Duplicate slug detection prevents conflicting seeds
 */

import { getAccessToken, getProjectId, toFsFields, fromFsFields } from "./firebase-admin.server";

function fsBaseUrl(projectId: string): string {
  const emulatorHost = Deno.env.get("FIRESTORE_EMULATOR_HOST");
  if (emulatorHost) {
    return `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`;
  }
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

interface SeedCategory {
  name: string;
  slug: string;
  order: number;
  commissionRate: number; // AVENTA rate (0-1)
  subcategories: Array<{
    name: string;
    slug: string;
    order: number;
    commissionRate?: number; // Override if different from parent
  }>;
}

// ── APPROVED AVENTA CATEGORY STRUCTURE (20 categories, 134 subcategories) ──
const SEED_DATA: SeedCategory[] = [
  {
    name: "Phones & Tablets",
    slug: "phones-tablets",
    order: 1,
    commissionRate: 0.0645,
    subcategories: [
      { name: "Smartphones", slug: "smartphones", order: 1 },
      { name: "Tablets", slug: "tablets", order: 2, commissionRate: 0.025 },
      { name: "Feature Phones", slug: "feature-phones", order: 3, commissionRate: 0.0175 },
      { name: "Mobile Accessories", slug: "mobile-accessories", order: 4 },
      { name: "Tablet Accessories", slug: "tablet-accessories", order: 5 },
      {
        name: "Refurbished Phones & Tablets",
        slug: "refurbished-phones-tablets",
        order: 6,
        commissionRate: 0.0175,
      },
    ],
  },
  {
    name: "Computers & Laptops",
    slug: "computers-laptops",
    order: 2,
    commissionRate: 0.043,
    subcategories: [
      { name: "Laptops", slug: "laptops", order: 1, commissionRate: 0.01 },
      { name: "Desktops", slug: "desktops", order: 2, commissionRate: 0.015 },
      { name: "Monitors", slug: "monitors", order: 3, commissionRate: 0.05 },
      {
        name: "Computer Accessories",
        slug: "computer-accessories",
        order: 4,
        commissionRate: 0.0645,
      },
      { name: "Components & Storage", slug: "components-storage", order: 5, commissionRate: 0.03 },
      { name: "Printers & Scanners", slug: "printers-scanners", order: 6, commissionRate: 0.0225 },
      { name: "Networking", slug: "networking", order: 7, commissionRate: 0.043 },
      { name: "Software", slug: "software", order: 8, commissionRate: 0.05 },
    ],
  },
  {
    name: "TV, Audio & Gaming",
    slug: "tv-audio-gaming",
    order: 3,
    commissionRate: 0.043,
    subcategories: [
      { name: "Televisions", slug: "televisions", order: 1, commissionRate: 0.02 },
      { name: "Home Audio & Theater", slug: "home-audio-theater", order: 2, commissionRate: 0.05 },
      {
        name: "Headphones & Earphones",
        slug: "headphones-earphones",
        order: 3,
        commissionRate: 0.043,
      },
      {
        name: "Gaming Consoles & Games",
        slug: "gaming-consoles-games",
        order: 4,
        commissionRate: 0.03,
      },
      { name: "Wearable Technology", slug: "wearable-technology", order: 5, commissionRate: 0.025 },
      { name: "Electronic Gadgets", slug: "electronic-gadgets", order: 6, commissionRate: 0.05 },
      {
        name: "TV & Video Accessories",
        slug: "tv-video-accessories",
        order: 7,
        commissionRate: 0.05,
      },
    ],
  },
  {
    name: "Cameras & Drones",
    slug: "cameras-drones",
    order: 4,
    commissionRate: 0.0255,
    subcategories: [
      { name: "DSLR", slug: "dslr", order: 1, commissionRate: 0.02 },
      { name: "Mirrorless", slug: "mirrorless", order: 2, commissionRate: 0.035 },
      { name: "Point & Shoot", slug: "point-shoot", order: 3, commissionRate: 0.0275 },
      { name: "Action Cameras", slug: "action-cameras", order: 4, commissionRate: 0.03 },
      { name: "Drones", slug: "drones", order: 5, commissionRate: 0.03 },
      { name: "Camera Accessories", slug: "camera-accessories", order: 6, commissionRate: 0.05 },
      { name: "Security Cameras", slug: "security-cameras", order: 7, commissionRate: 0.02 },
    ],
  },
  {
    name: "Home Appliances",
    slug: "home-appliances",
    order: 5,
    commissionRate: 0.02,
    subcategories: [
      { name: "Refrigerators & Freezers", slug: "refrigerators-freezers", order: 1 },
      { name: "Air Conditioners & Cooling", slug: "air-conditioners-cooling", order: 2 },
      {
        name: "Washing Machines & Dryers",
        slug: "washing-machines-dryers",
        order: 3,
        commissionRate: 0.025,
      },
      { name: "Microwave & Ovens", slug: "microwave-ovens", order: 4 },
      {
        name: "Small Kitchen Appliances",
        slug: "small-kitchen-appliances",
        order: 5,
        commissionRate: 0.0445,
      },
      {
        name: "Vacuums & Floor Care",
        slug: "vacuums-floor-care",
        order: 6,
        commissionRate: 0.0445,
      },
      { name: "Irons & Steamers", slug: "irons-steamers", order: 7, commissionRate: 0.0445 },
      { name: "Sewing Machines", slug: "sewing-machines", order: 8, commissionRate: 0.055 },
      { name: "Generators & Power", slug: "generators-power", order: 9, commissionRate: 0.03 },
    ],
  },
  {
    name: "Health & Beauty",
    slug: "health-beauty",
    order: 6,
    commissionRate: 0.0722,
    subcategories: [
      { name: "Makeup", slug: "makeup", order: 1 },
      { name: "Skin Care", slug: "skin-care", order: 2 },
      { name: "Hair Care", slug: "hair-care", order: 3 },
      { name: "Fragrances", slug: "fragrances", order: 4 },
      { name: "Personal Care", slug: "personal-care", order: 5 },
      { name: "Men's Grooming", slug: "mens-grooming", order: 6 },
      { name: "Health & Wellness", slug: "health-wellness", order: 7 },
      { name: "Medical Supplies", slug: "medical-supplies", order: 8 },
    ],
  },
  {
    name: "Fashion",
    slug: "fashion",
    order: 7,
    commissionRate: 0.0925,
    subcategories: [
      { name: "Men's Clothing", slug: "mens-clothing", order: 1 },
      { name: "Women's Clothing", slug: "womens-clothing", order: 2 },
      { name: "Men's Shoes", slug: "mens-shoes", order: 3 },
      { name: "Women's Shoes", slug: "womens-shoes", order: 4 },
      { name: "Kids' & Baby Fashion", slug: "kids-baby-fashion", order: 5, commissionRate: 0.0148 },
      { name: "Fashion Accessories", slug: "fashion-accessories", order: 6, commissionRate: 0.1 },
      { name: "Muslim Wear", slug: "muslim-wear", order: 7 },
      { name: "Lingerie & Sleepwear", slug: "lingerie-sleepwear", order: 8 },
    ],
  },
  {
    name: "Bags & Travel",
    slug: "bags-travel",
    order: 8,
    commissionRate: 0.085,
    subcategories: [
      { name: "Backpacks", slug: "backpacks", order: 1 },
      { name: "Handbags & Wallets", slug: "handbags-wallets", order: 2 },
      { name: "Luggage & Suitcases", slug: "luggage-suitcases", order: 3, commissionRate: 0.075 },
      { name: "Travel Accessories", slug: "travel-accessories", order: 4 },
      { name: "Kids' Bags", slug: "kids-bags", order: 5 },
    ],
  },
  {
    name: "Watches, Sunglasses & Jewellery",
    slug: "watches-jewellery",
    order: 9,
    commissionRate: 0.1,
    subcategories: [
      { name: "Watches", slug: "watches", order: 1 },
      { name: "Sunglasses & Eyewear", slug: "sunglasses-eyewear", order: 2 },
      { name: "Jewellery", slug: "jewellery", order: 3 },
    ],
  },
  {
    name: "Home & Living",
    slug: "home-living",
    order: 10,
    commissionRate: 0.074,
    subcategories: [
      { name: "Furniture", slug: "furniture", order: 1 },
      { name: "Bedding", slug: "bedding", order: 2 },
      { name: "Bath", slug: "bath", order: 3 },
      { name: "Home Decor", slug: "home-decor", order: 4 },
      { name: "Lighting", slug: "lighting", order: 5, commissionRate: 0.0778 },
      { name: "Kitchen & Dining", slug: "kitchen-dining", order: 6 },
      {
        name: "Storage & Organization",
        slug: "storage-organization",
        order: 7,
        commissionRate: 0.0778,
      },
      { name: "Laundry & Cleaning", slug: "laundry-cleaning", order: 8, commissionRate: 0.0717 },
      { name: "Outdoor & Garden", slug: "outdoor-garden", order: 9, commissionRate: 0.0778 },
    ],
  },
  {
    name: "Mother & Baby",
    slug: "mother-baby",
    order: 11,
    commissionRate: 0.0507,
    subcategories: [
      { name: "Baby Clothing & Accessories", slug: "baby-clothing-accessories", order: 1 },
      { name: "Diapering & Potty", slug: "diapering-potty", order: 2 },
      { name: "Feeding & Nursing", slug: "feeding-nursing", order: 3 },
      { name: "Baby Gear", slug: "baby-gear", order: 4 },
      { name: "Nursery", slug: "nursery", order: 5 },
      { name: "Maternity Care", slug: "maternity-care", order: 6 },
      { name: "Baby Health & Safety", slug: "baby-health-safety", order: 7 },
    ],
  },
  {
    name: "Sports & Outdoors",
    slug: "sports-outdoors",
    order: 12,
    commissionRate: 0.0478,
    subcategories: [
      { name: "Team Sports", slug: "team-sports", order: 1 },
      { name: "Racket Sports", slug: "racket-sports", order: 2 },
      { name: "Fitness & Exercise", slug: "fitness-exercise", order: 3 },
      { name: "Outdoor Recreation", slug: "outdoor-recreation", order: 4 },
      { name: "Cycling", slug: "cycling", order: 5 },
      { name: "Sports Nutrition", slug: "sports-nutrition", order: 6 },
      { name: "Sports Accessories", slug: "sports-accessories", order: 7 },
    ],
  },
  {
    name: "Toys & Games",
    slug: "toys-games",
    order: 13,
    commissionRate: 0.0478,
    subcategories: [
      { name: "Action Figures & Collectibles", slug: "action-figures-collectibles", order: 1 },
      { name: "Building Blocks", slug: "building-blocks", order: 2 },
      { name: "Dolls & Plush", slug: "dolls-plush", order: 3 },
      { name: "Educational Toys", slug: "educational-toys", order: 4 },
      { name: "Remote Control Toys", slug: "remote-control-toys", order: 5 },
      { name: "Board Games & Puzzles", slug: "board-games-puzzles", order: 6 },
      { name: "Arts & Crafts for Kids", slug: "arts-crafts-kids", order: 7 },
      { name: "Party & Dress Up", slug: "party-dress-up", order: 8 },
    ],
  },
  {
    name: "Groceries",
    slug: "groceries",
    order: 14,
    commissionRate: 0.0222,
    subcategories: [
      { name: "Beverages", slug: "beverages", order: 1, commissionRate: 0.0427 },
      {
        name: "Snacks & Confectionery",
        slug: "snacks-confectionery",
        order: 2,
        commissionRate: 0.0427,
      },
      { name: "Bakery & Breakfast", slug: "bakery-breakfast", order: 3, commissionRate: 0.0427 },
      { name: "Dairy & Chilled", slug: "dairy-chilled", order: 4, commissionRate: 0.0327 },
      { name: "Fresh Produce", slug: "fresh-produce", order: 5 },
      { name: "Frozen Foods", slug: "frozen-foods", order: 6, commissionRate: 0.0427 },
      { name: "Canned & Dry Goods", slug: "canned-dry-goods", order: 7 },
      { name: "Baking & Cooking", slug: "baking-cooking", order: 8 },
    ],
  },
  {
    name: "Automotive",
    slug: "automotive",
    order: 15,
    commissionRate: 0.0478,
    subcategories: [
      { name: "Car Accessories", slug: "car-accessories", order: 1, commissionRate: 0.0555 },
      {
        name: "Motorcycle Accessories",
        slug: "motorcycle-accessories",
        order: 2,
        commissionRate: 0.0555,
      },
      { name: "Auto Parts", slug: "auto-parts", order: 3, commissionRate: 0.0555 },
      { name: "Car Care & Tools", slug: "car-care-tools", order: 4, commissionRate: 0.0555 },
      { name: "Oils & Fluids", slug: "oils-fluids", order: 5, commissionRate: 0.0277 },
      { name: "Car Electronics", slug: "car-electronics", order: 6, commissionRate: 0.0555 },
    ],
  },
  {
    name: "Tools & DIY",
    slug: "tools-diy",
    order: 16,
    commissionRate: 0.0717,
    subcategories: [
      { name: "Power Tools", slug: "power-tools", order: 1, commissionRate: 0.0478 },
      { name: "Hand Tools", slug: "hand-tools", order: 2 },
      { name: "Hardware & Fixtures", slug: "hardware-fixtures", order: 3, commissionRate: 0.074 },
      { name: "Painting Supplies", slug: "painting-supplies", order: 4, commissionRate: 0.074 },
      { name: "Measuring & Testing", slug: "measuring-testing", order: 5, commissionRate: 0.089 },
      { name: "Safety & Protection", slug: "safety-protection", order: 6, commissionRate: 0.074 },
      { name: "Garden & Outdoor", slug: "garden-outdoor", order: 7, commissionRate: 0.074 },
    ],
  },
  {
    name: "Stationery & Craft",
    slug: "stationery-craft",
    order: 17,
    commissionRate: 0.024,
    subcategories: [
      { name: "Office & School Supplies", slug: "office-school-supplies", order: 1 },
      { name: "Art Supplies", slug: "art-supplies", order: 2, commissionRate: 0.0335 },
      { name: "Paper Products", slug: "paper-products", order: 3 },
      {
        name: "Writing Instruments",
        slug: "writing-instruments",
        order: 4,
        commissionRate: 0.0335,
      },
      { name: "Craft & Sewing", slug: "craft-sewing", order: 5, commissionRate: 0.0667 },
      { name: "Gift Packaging", slug: "gift-packaging", order: 6, commissionRate: 0.0335 },
    ],
  },
  {
    name: "Pet Supplies",
    slug: "pet-supplies",
    order: 18,
    commissionRate: 0.0502,
    subcategories: [
      { name: "Dog Supplies", slug: "dog-supplies", order: 1 },
      { name: "Cat Supplies", slug: "cat-supplies", order: 2 },
      { name: "Fish & Aquarium", slug: "fish-aquarium", order: 3 },
      { name: "Bird Supplies", slug: "bird-supplies", order: 4 },
      { name: "Small Pets", slug: "small-pets", order: 5 },
    ],
  },
  {
    name: "Books, Media & Hobbies",
    slug: "books-media-hobbies",
    order: 19,
    commissionRate: 0.074,
    subcategories: [
      { name: "Books", slug: "books", order: 1, commissionRate: 0.0717 },
      { name: "Music", slug: "music", order: 2, commissionRate: 0.0832 },
      { name: "Movies & TV", slug: "movies-tv", order: 3, commissionRate: 0.089 },
      {
        name: "Musical Instruments",
        slug: "musical-instruments",
        order: 4,
        commissionRate: 0.0555,
      },
      { name: "Hobbies & Collectibles", slug: "hobbies-collectibles", order: 5 },
    ],
  },
  {
    name: "Digital Goods & Services",
    slug: "digital-goods",
    order: 20,
    commissionRate: 0.0475,
    subcategories: [
      { name: "Mobile Recharge & Top-up", slug: "mobile-recharge-topup", order: 1 },
      { name: "Game Credits & Vouchers", slug: "game-credits-vouchers", order: 2 },
      { name: "Gift Cards", slug: "gift-cards", order: 3 },
      { name: "Streaming Subscriptions", slug: "streaming-subscriptions", order: 4 },
      { name: "Software Licenses", slug: "software-licenses", order: 5 },
    ],
  },
];

// ── VALIDATION HELPERS ──

const MAX_RATE = 0.2; // 20% absolute cap
const MIN_RATE = 0.005; // 0.5% minimum

function validateRate(rate: number, ctx: string): void {
  if (rate == null || isNaN(rate) || rate < 0 || rate > MAX_RATE) {
    throw new Error(`Invalid commission rate for ${ctx}: ${rate} (must be 0–${MAX_RATE})`);
  }
  if (rate < MIN_RATE) {
    throw new Error(`Commission rate for ${ctx} (${rate}) is below minimum ${MIN_RATE}`);
  }
}

/** Validate the entire SEED_DATA before writing anything. Throws on any issue. */
export function validateSeedData(): {
  categories: number;
  subcategories: number;
  overrides: number;
  inherited: number;
  duplicateCategorySlugs: string[];
  duplicateSubcategorySlugs: string[];
} {
  let totalCats = 0;
  let totalSubs = 0;
  let overrides = 0;
  let inherited = 0;
  const catSlugs = new Set<string>();
  const subSlugs = new Set<string>();
  const dupCatSlugs: string[] = [];
  const dupSubSlugs: string[] = [];

  for (const cat of SEED_DATA) {
    totalCats++;
    validateRate(cat.commissionRate, `category "${cat.name}"`);

    if (catSlugs.has(cat.slug)) dupCatSlugs.push(cat.slug);
    catSlugs.add(cat.slug);

    for (const sub of cat.subcategories) {
      totalSubs++;
      const subCtx = `subcategory "${cat.name} > ${sub.name}"`;
      if (sub.commissionRate != null) {
        overrides++;
        validateRate(sub.commissionRate, subCtx);
      } else {
        inherited++;
      }

      // Check for duplicate subcategory slugs GLOBALLY
      if (subSlugs.has(sub.slug)) dupSubSlugs.push(sub.slug);
      subSlugs.add(sub.slug);

      // Orphan prevention: every sub must have a non-empty parent
      if (!cat.slug || !cat.name) {
        throw new Error(
          `Subcategory "${sub.name}" has an invalid parent (slug="${cat.slug}", name="${cat.name}")`,
        );
      }
    }
  }

  if (dupCatSlugs.length > 0) {
    throw new Error(`Duplicate category slugs: ${dupCatSlugs.join(", ")}`);
  }
  if (dupSubSlugs.length > 0) {
    throw new Error(`Duplicate subcategory slugs: ${dupSubSlugs.join(", ")}`);
  }

  return {
    categories: totalCats,
    subcategories: totalSubs,
    overrides,
    inherited,
    duplicateCategorySlugs: dupCatSlugs,
    duplicateSubcategorySlugs: dupSubSlugs,
  };
}

/**
 * Seeds all categories and subcategories into Firestore.
 *
 * Idempotent: uses deterministic slug-based document IDs.
 * Running multiple times updates existing docs, never creates duplicates.
 * Parent-child relationship explicitly stored via parentCategoryId on subcategories.
 *
 * @returns Summary of created/updated categories and subcategories
 */
export async function seedCategoriesAndCommissions(): Promise<{
  categoriesCreated: number;
  subcategoriesCreated: number;
  categoriesUpdated: number;
  subcategoriesUpdated: number;
  errors: string[];
  validation: ReturnType<typeof validateSeedData>;
}> {
  // Pre-flight validation — fail fast if seed data has issues
  const validation = validateSeedData();

  const projectId = getProjectId();
  const token = await getAccessToken();
  const base = fsBaseUrl(projectId);
  const nowMs = Date.now();

  let categoriesCreated = 0;
  let subcategoriesCreated = 0;
  let categoriesUpdated = 0;
  let subcategoriesUpdated = 0;
  const errors: string[] = [];

  for (const cat of SEED_DATA) {
    // Deterministic ID = slug (safe for Firestore document IDs)
    const catDocId = cat.slug;

    // Check if category already exists (idempotent)
    const existingCatRes = await fetch(`${base}/categories/${encodeURIComponent(catDocId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    const catFields: Record<string, unknown> = {
      name: cat.name,
      slug: cat.slug,
      image: null,
      order: cat.order,
      commissionRate: cat.commissionRate,
      updatedAt: nowMs,
    };

    if (existingCatRes.ok) {
      // Update existing category in place
      try {
        await fetch(`${base}/categories/${encodeURIComponent(catDocId)}?`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ fields: toFsFields(catFields) }),
        });
        categoriesUpdated++;
      } catch (e) {
        errors.push(`Failed to update category ${cat.name}: ${String(e)}`);
      }
    } else {
      // Create new category with deterministic ID via PATCH (upsert)
      try {
        const createFields: Record<string, unknown> = { ...catFields, createdAt: nowMs };
        const res = await fetch(`${base}/categories/${encodeURIComponent(catDocId)}?`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ fields: toFsFields(createFields) }),
        });
        if (res.ok) {
          categoriesCreated++;
        } else {
          errors.push(`Failed to create category ${cat.name}: ${await res.text()}`);
          continue;
        }
      } catch (e) {
        errors.push(`Exception creating category ${cat.name}: ${String(e)}`);
        continue;
      }
    }

    // Now create/update subcategories with deterministic IDs and parent reference
    for (const sub of cat.subcategories) {
      // Deterministic subcategory ID = slug (unique within parent subcollection)
      const subDocId = sub.slug;

      const subFields: Record<string, unknown> = {
        name: sub.name,
        slug: sub.slug,
        order: sub.order,
        parentCategoryId: catDocId, // Explicit parent reference — prevents orphans
        updatedAt: nowMs,
      };
      if (sub.commissionRate != null) {
        subFields.commissionRate = sub.commissionRate;
      }

      // Check if subcategory already exists
      const existingSubRes = await fetch(
        `${base}/categories/${encodeURIComponent(catDocId)}/subcategories/${encodeURIComponent(subDocId)}`,
        { headers: { authorization: `Bearer ${token}` } },
      );

      if (existingSubRes.ok) {
        // Update existing subcategory
        try {
          await fetch(
            `${base}/categories/${encodeURIComponent(catDocId)}/subcategories/${encodeURIComponent(subDocId)}?`,
            {
              method: "PATCH",
              headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
              body: JSON.stringify({ fields: toFsFields(subFields) }),
            },
          );
          subcategoriesUpdated++;
        } catch (e) {
          errors.push(`Failed to update subcategory ${cat.name} > ${sub.name}: ${String(e)}`);
        }
      } else {
        // Create new subcategory with deterministic ID via PATCH (upsert)
        try {
          const createFields: Record<string, unknown> = {
            ...subFields,
            createdAt: nowMs,
          };
          const res = await fetch(
            `${base}/categories/${encodeURIComponent(catDocId)}/subcategories/${encodeURIComponent(subDocId)}?`,
            {
              method: "PATCH",
              headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
              body: JSON.stringify({ fields: toFsFields(createFields) }),
            },
          );
          if (res.ok) {
            subcategoriesCreated++;
          } else {
            errors.push(
              `Failed to create subcategory ${cat.name} > ${sub.name}: ${await res.text()}`,
            );
          }
        } catch (e) {
          errors.push(`Exception creating subcategory ${cat.name} > ${sub.name}: ${String(e)}`);
        }
      }
    }
  }

  // Update settings/site with commission config
  try {
    const settingsBody = {
      fields: toFsFields({
        commission: {
          defaultRate: 8, // 8% fallback default
          categoryBased: true, // Flag to enable category-based commission
          source: "Daraz PK Commission Rates - May 2026",
          aventaMultiplier: 0.5, // AVENTA = 50% of Daraz rate
          updatedAt: nowMs,
        },
      }),
    };
    await fetch(`${base}/settings/site?`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(settingsBody),
    });
  } catch (e) {
    errors.push(`Failed to update commission settings: ${String(e)}`);
  }

  return {
    categoriesCreated,
    subcategoriesCreated,
    categoriesUpdated,
    subcategoriesUpdated,
    errors,
    validation,
  };
}

/** Export SEED_DATA for testing and reconciliation */
export { SEED_DATA };
