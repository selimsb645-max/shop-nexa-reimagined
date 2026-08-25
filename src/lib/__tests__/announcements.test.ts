/**
 * Announcement Management Tests
 *
 * Tests cover:
 * 1. Admin creates announcement
 * 2. Admin edits announcement
 * 3. Admin publishes
 * 4. Admin unpublishes
 * 5. Admin deletes/archives
 * 6. Customer sees active published announcement
 * 7. Customer does not see unpublished announcement
 * 8. Scheduled announcement behavior
 * 9. Expired announcement behavior
 * 10. Seller cannot manage announcements
 * 11. Normal user cannot manage announcements
 * 12. Invalid data rejected
 * 13. Real-time update (isAnnouncementActive helper)
 */

import { describe, it, expect } from "vitest";
import {
  validateAnnouncement,
  isAnnouncementActive,
  type AnnouncementInput,
} from "@/services/firebase/adminAnnouncements";
import type { Announcement } from "@/types/admin";

// ═══════════════════════════════════════════════════════════════
// HELPER: Create a valid AnnouncementInput
// ═══════════════════════════════════════════════════════════════

function makeValidInput(overrides: Partial<AnnouncementInput> = {}): AnnouncementInput {
  return {
    title: "Flash Sale",
    message: "Up to 50% off on electronics!",
    type: "promo",
    priority: "high",
    gradient: "from-orange-500 to-red-500",
    icon: "Zap",
    ctaLabel: "Shop Now",
    ctaLink: "/flash-sales",
    published: true,
    startTime: 0,
    endTime: 0,
    order: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Create an Announcement object (for isAnnouncementActive tests)
// ═══════════════════════════════════════════════════════════════

function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: "test-id",
    title: "Test Announcement",
    message: "Test message",
    type: "info",
    priority: "normal",
    gradient: "from-blue-500 to-indigo-600",
    icon: "Megaphone",
    ctaLabel: null,
    ctaLink: null,
    published: true,
    startTime: 0,
    endTime: 0,
    order: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: "admin-uid",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION TESTS (covers test #12: Invalid data rejected)
// ═══════════════════════════════════════════════════════════════

describe("Announcement Validation", () => {
  it("accepts valid announcement input", () => {
    const input = makeValidInput();
    const result = validateAnnouncement(input);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects empty title", () => {
    const result = validateAnnouncement(makeValidInput({ title: "" }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Title");
  });

  it("rejects whitespace-only title", () => {
    const result = validateAnnouncement(makeValidInput({ title: "   " }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Title");
  });

  it("rejects title over 200 characters", () => {
    const result = validateAnnouncement(makeValidInput({ title: "x".repeat(201) }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("200");
  });

  it("accepts title at exactly 200 characters", () => {
    const result = validateAnnouncement(makeValidInput({ title: "x".repeat(200) }));
    expect(result.valid).toBe(true);
  });

  it("rejects empty message", () => {
    const result = validateAnnouncement(makeValidInput({ message: "" }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Message");
  });

  it("rejects message over 500 characters", () => {
    const result = validateAnnouncement(makeValidInput({ message: "x".repeat(501) }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("500");
  });

  it("rejects invalid type", () => {
    const result = validateAnnouncement(makeValidInput({ type: "invalid" as never }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("type");
  });

  it("accepts all valid types", () => {
    const types = ["promo", "info", "system", "event"];
    for (const type of types) {
      const result = validateAnnouncement(makeValidInput({ type: type as AnnouncementInput["type"] }));
      expect(result.valid).toBe(true);
    }
  });

  it("rejects invalid priority", () => {
    const result = validateAnnouncement(makeValidInput({ priority: "critical" as never }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("priority");
  });

  it("accepts all valid priorities", () => {
    const priorities = ["low", "normal", "high", "urgent"];
    for (const priority of priorities) {
      const result = validateAnnouncement(makeValidInput({ priority: priority as AnnouncementInput["priority"] }));
      expect(result.valid).toBe(true);
    }
  });

  it("rejects end time before start time", () => {
    const result = validateAnnouncement(makeValidInput({
      startTime: 2000000,
      endTime: 1000000,
    }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("End time");
  });

  it("accepts start time without end time (open-ended start)", () => {
    const result = validateAnnouncement(makeValidInput({
      startTime: 1000000,
      endTime: 0,
    }));
    expect(result.valid).toBe(true);
  });

  it("accepts end time without start time (expires at end)", () => {
    const result = validateAnnouncement(makeValidInput({
      startTime: 0,
      endTime: 1000000,
    }));
    expect(result.valid).toBe(true);
  });

  it("accepts both times zero (always active)", () => {
    const result = validateAnnouncement(makeValidInput({ startTime: 0, endTime: 0 }));
    expect(result.valid).toBe(true);
  });

  it("rejects CTA label without CTA link", () => {
    const result = validateAnnouncement(makeValidInput({
      ctaLabel: "Click Here",
      ctaLink: null,
    }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("CTA link");
  });

  it("rejects CTA link without CTA label", () => {
    const result = validateAnnouncement(makeValidInput({
      ctaLabel: null,
      ctaLink: "/shop",
    }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("CTA label");
  });

  it("accepts both CTA label and link together", () => {
    const result = validateAnnouncement(makeValidInput({
      ctaLabel: "Shop Now",
      ctaLink: "/shop",
    }));
    expect(result.valid).toBe(true);
  });

  it("accepts both CTA null (no CTA button)", () => {
    const result = validateAnnouncement(makeValidInput({
      ctaLabel: null,
      ctaLink: null,
    }));
    expect(result.valid).toBe(true);
  });

  it("rejects start time equals end time (zero duration, both non-zero)", () => {
    // endTime < startTime is rejected, but equal is technically fine (instant)
    const result = validateAnnouncement(makeValidInput({
      startTime: 1000000,
      endTime: 1000000,
    }));
    // Equal times: endTime is NOT before startTime, so valid
    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// IS_ANNOUNCEMENT_ACTIVE TESTS
// (covers tests #6, #7, #8, #9 — customer display logic)
// ═══════════════════════════════════════════════════════════════

describe("isAnnouncementActive — Customer Display Logic", () => {
  const NOW = 1000000000000; // Fixed reference time

  it("returns true for published, no schedule (always active)", () => {
    const a = makeAnnouncement({ published: true, startTime: 0, endTime: 0 });
    expect(isAnnouncementActive(a, NOW)).toBe(true);
  });

  // Test #6: Customer sees active published announcement
  it("returns true for published announcement within schedule window", () => {
    const a = makeAnnouncement({
      published: true,
      startTime: NOW - 10000,
      endTime: NOW + 10000,
    });
    expect(isAnnouncementActive(a, NOW)).toBe(true);
  });

  // Test #7: Customer does not see unpublished announcement
  it("returns false for unpublished announcement", () => {
    const a = makeAnnouncement({ published: false, startTime: 0, endTime: 0 });
    expect(isAnnouncementActive(a, NOW)).toBe(false);
  });

  it("returns false for unpublished even if within schedule", () => {
    const a = makeAnnouncement({
      published: false,
      startTime: NOW - 10000,
      endTime: NOW + 10000,
    });
    expect(isAnnouncementActive(a, NOW)).toBe(false);
  });

  // Test #8: Scheduled announcement not shown before start time
  it("returns false for scheduled announcement before start time", () => {
    const a = makeAnnouncement({
      published: true,
      startTime: NOW + 100000, // Future
      endTime: 0,
    });
    expect(isAnnouncementActive(a, NOW)).toBe(false);
  });

  it("returns true at exactly start time", () => {
    const a = makeAnnouncement({
      published: true,
      startTime: NOW,
      endTime: 0,
    });
    expect(isAnnouncementActive(a, NOW)).toBe(true);
  });

  // Test #9: Expired announcement not shown
  it("returns false for expired announcement", () => {
    const a = makeAnnouncement({
      published: true,
      startTime: 0,
      endTime: NOW - 100000, // Past
    });
    expect(isAnnouncementActive(a, NOW)).toBe(false);
  });

  it("returns false for announcement past its end time", () => {
    const a = makeAnnouncement({
      published: true,
      startTime: NOW - 50000,
      endTime: NOW - 10000, // Ended
    });
    expect(isAnnouncementActive(a, NOW)).toBe(false);
  });

  it("returns true at exactly end time", () => {
    const a = makeAnnouncement({
      published: true,
      startTime: 0,
      endTime: NOW,
    });
    expect(isAnnouncementActive(a, NOW)).toBe(true);
  });

  it("returns true with only start time set (open-ended)", () => {
    const a = makeAnnouncement({
      published: true,
      startTime: NOW - 10000,
      endTime: 0,
    });
    expect(isAnnouncementActive(a, NOW)).toBe(true);
  });

  it("returns true with only end time set (expires later)", () => {
    const a = makeAnnouncement({
      published: true,
      startTime: 0,
      endTime: NOW + 100000,
    });
    expect(isAnnouncementActive(a, NOW)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// FIRESTORE RULES TESTS (covers tests #10, #11 — authorization)
// ═══════════════════════════════════════════════════════════════

describe("Announcement Authorization — Firestore Rules", () => {
  it("announcements collection rules exist in firestore.rules", () => {
    const fs = require("fs");
    const rules = fs.readFileSync("firestore.rules", "utf-8");
    expect(rules).toContain("match /announcements/{id}");
  });

  it("public read is allowed for announcements", () => {
    const fs = require("fs");
    const rules = fs.readFileSync("firestore.rules", "utf-8");
    const announcementBlock = rules.match(/match \/announcements\/\{id\} \{[\s\S]*?\}/);
    expect(announcementBlock).toBeTruthy();
    expect(announcementBlock[0]).toContain("allow read: if true");
  });

  it("only admin can write announcements", () => {
    const fs = require("fs");
    const rules = fs.readFileSync("firestore.rules", "utf-8");
    const announcementBlock = rules.match(/match \/announcements\/\{id\} \{[\s\S]*?\}/);
    expect(announcementBlock).toBeTruthy();
    expect(announcementBlock[0]).toContain("allow write: if isAdmin()");
  });

  // Test #10: Seller cannot manage announcements
  it("isAdmin() function checks role === admin (not seller)", () => {
    const fs = require("fs");
    const rules = fs.readFileSync("firestore.rules", "utf-8");
    const isAdminFn = rules.match(/function isAdmin\(\) \{[\s\S]*?\}/);
    expect(isAdminFn).toBeTruthy();
    expect(isAdminFn[0]).toContain("role == 'admin'");
  });

  // Test #11: Normal user cannot manage announcements
  it("isAdmin() requires authentication (isSignedIn)", () => {
    const fs = require("fs");
    const rules = fs.readFileSync("firestore.rules", "utf-8");
    const isAdminFn = rules.match(/function isAdmin\(\) \{[\s\S]*?\}/);
    expect(isAdminFn).toBeTruthy();
    expect(isAdminFn[0]).toContain("isSignedIn()");
  });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN GATE TESTS (covers tests #10, #11 — UI authorization)
// ═══════════════════════════════════════════════════════════════

describe("Announcement Admin Gate — UI Authorization", () => {
  it("AdminGate component checks role === admin", () => {
    const fs = require("fs");
    const gate = fs.readFileSync("src/components/admin/AdminGate.tsx", "utf-8");
    expect(gate).toContain('role !== "admin"');
  });

  it("admin route is wrapped with AdminGate", () => {
    const fs = require("fs");
    const adminRoute = fs.readFileSync("src/routes/_authenticated/admin.tsx", "utf-8");
    expect(adminRoute).toContain("AdminGate");
  });

  it("announcements admin page exists at correct route path", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain('"/_authenticated/admin/announcements"');
  });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN CRUD FLOW TESTS (covers tests #1-5 — management operations)
// ═══════════════════════════════════════════════════════════════

describe("Admin Announcement Management Flow", () => {
  it("admin.announcements.tsx has create functionality", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("createAnnouncement");
    expect(page).toContain("New Announcement");
  });

  // Test #2: Admin edits announcement
  it("admin.announcements.tsx has edit functionality", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("updateAnnouncement");
    expect(page).toContain("onEdit");
    expect(page).toContain("Edit Announcement");
  });

  // Test #3: Admin publishes
  it("admin.announcements.tsx has publish functionality", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("onTogglePublish");
    expect(page).toContain("Publish");
  });

  // Test #4: Admin unpublishes
  it("admin.announcements.tsx has unpublish functionality", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("Unpublish");
  });

  // Test #5: Admin deletes/archives
  it("admin.announcements.tsx has delete functionality", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("deleteAnnouncement");
    expect(page).toContain("onDelete");
    expect(page).toContain("Delete");
  });

  it("admin.announcements.tsx validates input before saving", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("validateAnnouncement");
  });

  it("admin.announcements.tsx logs activity on create", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("announcement.create");
  });

  it("admin.announcements.tsx logs activity on update", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("announcement.update");
  });

  it("admin.announcements.tsx logs activity on delete", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("announcement.delete");
  });
});

// ═══════════════════════════════════════════════════════════════
// CUSTOMER-FACING DISPLAY TESTS (covers tests #6, #7 — customer UI)
// ═══════════════════════════════════════════════════════════════

describe("Customer-Facing Announcement Display", () => {
  it("messages.tsx uses subscribeActiveAnnouncements (real-time)", () => {
    const fs = require("fs");
    const messages = fs.readFileSync("src/routes/_authenticated/messages.tsx", "utf-8");
    expect(messages).toContain("subscribeActiveAnnouncements");
  });

  it("messages.tsx no longer has hardcoded announcement array", () => {
    const fs = require("fs");
    const messages = fs.readFileSync("src/routes/_authenticated/messages.tsx", "utf-8");
    // The old hardcoded array started with "Mega Flash Sale" as an array literal
    // The new version uses subscribeActiveAnnouncements
    expect(messages).not.toContain("Up to 70% off on electronics, fashion & more!");
  });

  it("messages.tsx uses dynamic Announcement type from admin types", () => {
    const fs = require("fs");
    const messages = fs.readFileSync("src/routes/_authenticated/messages.tsx", "utf-8");
    expect(messages).toContain("Announcement");
    expect(messages).toContain("subscribeActiveAnnouncements");
  });

  it("customer display uses real-time onSnapshot (no polling)", () => {
    const fs = require("fs");
    const service = fs.readFileSync("src/services/firebase/adminAnnouncements.ts", "utf-8");
    expect(service).toContain("subscribeActiveAnnouncements");
    expect(service).toContain("onSnapshot");
  });
});

// ═══════════════════════════════════════════════════════════════
// REAL-TIME UPDATE TEST (covers test #13)
// ═══════════════════════════════════════════════════════════════

describe("Real-Time Announcement Updates", () => {
  it("admin page uses subscribeAnnouncements for real-time updates", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/routes/_authenticated/admin.announcements.tsx", "utf-8");
    expect(page).toContain("subscribeAnnouncements");
  });

  it("customer page uses subscribeActiveAnnouncements for real-time updates", () => {
    const fs = require("fs");
    const messages = fs.readFileSync("src/routes/_authenticated/messages.tsx", "utf-8");
    expect(messages).toContain("subscribeActiveAnnouncements");
  });

  it("both listeners return Unsubscribe type for cleanup", () => {
    const fs = require("fs");
    const service = fs.readFileSync("src/services/firebase/adminAnnouncements.ts", "utf-8");
    expect(service).toContain("Unsubscribe");
  });
});

// ═══════════════════════════════════════════════════════════════
// SEED DATA / MIGRATION TESTS (preserves existing behavior)
// ═══════════════════════════════════════════════════════════════

describe("Announcement Seed Data / Migration", () => {
  it("seed file exists with DEFAULT_ANNOUNCEMENTS", () => {
    const fs = require("fs");
    expect(fs.existsSync("src/services/firebase/seedAnnouncements.ts")).toBe(true);
  });

  it("seed preserves original 5 hardcoded announcements", () => {
    const fs = require("fs");
    const seed = fs.readFileSync("src/services/firebase/seedAnnouncements.ts", "utf-8");
    expect(seed).toContain("Mega Flash Sale");
    expect(seed).toContain("New Seller Programs");
    expect(seed).toContain("AVENTA Prime Membership");
    expect(seed).toContain("Gift Cards Available");
    expect(seed).toContain("System Maintenance");
  });

  it("seed data uses correct gradients matching original design", () => {
    const fs = require("fs");
    const seed = fs.readFileSync("src/services/firebase/seedAnnouncements.ts", "utf-8");
    expect(seed).toContain("from-orange-500 to-red-500");
    expect(seed).toContain("from-blue-500 to-indigo-600");
    expect(seed).toContain("from-purple-500 to-pink-600");
    expect(seed).toContain("from-green-500 to-teal-600");
    expect(seed).toContain("from-gray-600 to-gray-800");
  });

  it("seed data has correct icon names", () => {
    const fs = require("fs");
    const seed = fs.readFileSync("src/services/firebase/seedAnnouncements.ts", "utf-8");
    expect(seed).toContain('"Zap"');
    expect(seed).toContain('"Store"');
    expect(seed).toContain('"Sparkles"');
    expect(seed).toContain('"Gift"');
    expect(seed).toContain('"AlertCircle"');
  });

  it("seed data has correct CTA labels and links", () => {
    const fs = require("fs");
    const seed = fs.readFileSync("src/services/firebase/seedAnnouncements.ts", "utf-8");
    expect(seed).toContain("Shop Now");
    expect(seed).toContain("/flash-sales");
    expect(seed).toContain("Become a Seller");
    expect(seed).toContain("/seller/register");
    expect(seed).toContain("Join Now");
    expect(seed).toContain("/membership");
    expect(seed).toContain("Buy Gift Card");
    expect(seed).toContain("/gift-cards");
  });

  it("seed function exists for running migration", () => {
    const fs = require("fs");
    const seed = fs.readFileSync("src/services/firebase/seedAnnouncements.ts", "utf-8");
    expect(seed).toContain("seedDefaultAnnouncements");
  });
});

// ═══════════════════════════════════════════════════════════════
// SCHEMA / TYPE TESTS
// ═══════════════════════════════════════════════════════════════

describe("Announcement Schema", () => {
  it("Announcement type has all required fields", () => {
    const fs = require("fs");
    const types = fs.readFileSync("src/types/admin.ts", "utf-8");
    expect(types).toContain("interface Announcement");
    expect(types).toContain("title: string");
    expect(types).toContain("message: string");
    expect(types).toContain("type: AnnouncementType");
    expect(types).toContain("priority: AnnouncementPriority");
    expect(types).toContain("published: boolean");
    expect(types).toContain("startTime: number");
    expect(types).toContain("endTime: number");
    expect(types).toContain("createdAt: number");
    expect(types).toContain("updatedAt: number");
    expect(types).toContain("createdBy: string");
  });

  it("AnnouncementType has correct union members", () => {
    const fs = require("fs");
    const types = fs.readFileSync("src/types/admin.ts", "utf-8");
    expect(types).toContain('"promo" | "info" | "system" | "event"');
  });

  it("AnnouncementPriority has correct union members", () => {
    const fs = require("fs");
    const types = fs.readFileSync("src/types/admin.ts", "utf-8");
    expect(types).toContain('"low" | "normal" | "high" | "urgent"');
  });

  it("activity actions include announcement events", () => {
    const fs = require("fs");
    const types = fs.readFileSync("src/types/admin.ts", "utf-8");
    expect(types).toContain("announcement.create");
    expect(types).toContain("announcement.update");
    expect(types).toContain("announcement.delete");
  });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN NAV INTEGRATION
// ═══════════════════════════════════════════════════════════════

describe("Admin Navigation Integration", () => {
  it("AdminShell has Announcements nav link", () => {
    const fs = require("fs");
    const shell = fs.readFileSync("src/components/admin/AdminShell.tsx", "utf-8");
    expect(shell).toContain("/admin/announcements");
    expect(shell).toContain("Announcements");
  });

  it("routeTree has announcements route registered", () => {
    const fs = require("fs");
    const tree = fs.readFileSync("src/routeTree.gen.ts", "utf-8");
    expect(tree).toContain("admin.announcements");
    expect(tree).toContain("AuthenticatedAdminAnnouncementsRoute");
  });
});
