/**
 * Admin Announcement Management Service
 *
 * CRUD operations + real-time listener for the "announcements" Firestore collection.
 * Only admin users can write (enforced by Firestore rules).
 * All users can read published, currently-active announcements.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  orderBy,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import type {
  Announcement,
  AnnouncementType,
  AnnouncementPriority,
} from "@/types/admin";

const ANNOUNCEMENTS_COL = "announcements";

// ═══════════════════════════════════════════════════════════════
// MAPPING
// ═══════════════════════════════════════════════════════════════

function mapAnnouncement(id: string, d: Record<string, unknown>): Announcement {
  const toMs = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "toMillis" in v) {
      return (v as { toMillis: () => number }).toMillis();
    }
    return 0;
  };

  return {
    id,
    title: String(d.title ?? ""),
    message: String(d.message ?? ""),
    type: (d.type as AnnouncementType) ?? "info",
    priority: (d.priority as AnnouncementPriority) ?? "normal",
    gradient: String(d.gradient ?? "from-blue-500 to-indigo-600"),
    icon: String(d.icon ?? "Info"),
    ctaLabel: (d.ctaLabel as string | null) ?? null,
    ctaLink: (d.ctaLink as string | null) ?? null,
    published: Boolean(d.published ?? false),
    startTime: toMs(d.startTime),
    endTime: toMs(d.endTime),
    order: Number(d.order ?? 0),
    createdAt: toMs(d.createdAt),
    updatedAt: toMs(d.updatedAt),
    createdBy: String(d.createdBy ?? ""),
  };
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

export interface AnnouncementInput {
  title: string;
  message: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  gradient: string;
  icon: string;
  ctaLabel: string | null;
  ctaLink: string | null;
  published: boolean;
  startTime: number;
  endTime: number;
  order: number;
}

export function validateAnnouncement(input: AnnouncementInput): {
  valid: boolean;
  error?: string;
} {
  if (!input.title || !input.title.trim()) {
    return { valid: false, error: "Title cannot be empty." };
  }
  if (input.title.length > 200) {
    return { valid: false, error: "Title must be under 200 characters." };
  }
  if (!input.message || !input.message.trim()) {
    return { valid: false, error: "Message cannot be empty." };
  }
  if (input.message.length > 500) {
    return { valid: false, error: "Message must be under 500 characters." };
  }
  const validTypes: AnnouncementType[] = ["promo", "info", "system", "event"];
  if (!validTypes.includes(input.type)) {
    return { valid: false, error: "Invalid announcement type." };
  }
  const validPriorities: AnnouncementPriority[] = ["low", "normal", "high", "urgent"];
  if (!validPriorities.includes(input.priority)) {
    return { valid: false, error: "Invalid priority level." };
  }
  // Schedule validation
  if (input.startTime > 0 && input.endTime > 0 && input.endTime < input.startTime) {
    return { valid: false, error: "End time cannot be before start time." };
  }
  if (input.ctaLabel && !input.ctaLink) {
    return { valid: false, error: "CTA link is required when CTA label is set." };
  }
  if (!input.ctaLabel && input.ctaLink) {
    return { valid: false, error: "CTA label is required when CTA link is set." };
  }
  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════
// ADMIN CRUD
// ═══════════════════════════════════════════════════════════════

export async function listAnnouncements(): Promise<Announcement[]> {
  const snap = await getDocs(
    query(collection(getDb(), ANNOUNCEMENTS_COL), orderBy("order", "asc"))
  );
  return snap.docs.map((d) => mapAnnouncement(d.id, d.data()));
}

export async function createAnnouncement(
  input: AnnouncementInput,
  adminUid: string,
): Promise<string> {
  const validation = validateAnnouncement(input);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const ref = await addDoc(collection(getDb(), ANNOUNCEMENTS_COL), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: adminUid,
  });
  return ref.id;
}

export async function updateAnnouncement(
  id: string,
  patch: Partial<AnnouncementInput>,
): Promise<void> {
  // Validate patch fields if present
  if ("title" in patch || "message" in patch || "type" in patch ||
      "priority" in patch || "startTime" in patch || "endTime" in patch ||
      "ctaLabel" in patch || "ctaLink" in patch) {
    // Re-validate by merging patch with existing — but for simplicity,
    // validate the key constraints that are present in the patch
    if ("title" in patch && (!patch.title || !patch.title.trim())) {
      throw new Error("Title cannot be empty.");
    }
    if ("message" in patch && (!patch.message || !patch.message.trim())) {
      throw new Error("Message cannot be empty.");
    }
    if ("startTime" in patch && "endTime" in patch &&
        patch.startTime! > 0 && patch.endTime! > 0 && patch.endTime! < patch.startTime!) {
      throw new Error("End time cannot be before start time.");
    }
    if ("ctaLabel" in patch && patch.ctaLabel && !patch.ctaLink) {
      throw new Error("CTA link is required when CTA label is set.");
    }
  }
  await updateDoc(doc(getDb(), ANNOUNCEMENTS_COL, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), ANNOUNCEMENTS_COL, id));
}

// ═══════════════════════════════════════════════════════════════
// REAL-TIME LISTENER (for admin dashboard)
// ═══════════════════════════════════════════════════════════════

export function subscribeAnnouncements(
  cb: (announcements: Announcement[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(getDb(), ANNOUNCEMENTS_COL), orderBy("order", "asc")),
    (snap) => {
      cb(snap.docs.map((d) => mapAnnouncement(d.id, d.data())));
    },
  );
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER-FACING (reads only published + active)
// ═══════════════════════════════════════════════════════════════

/**
 * Get all published announcements that are currently active
 * (within their schedule window, or no schedule).
 * Called from client — Firestore rules allow public read.
 */
export async function getActiveAnnouncements(): Promise<Announcement[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), ANNOUNCEMENTS_COL),
      where("published", "==", true),
      orderBy("order", "asc"),
    )
  );
  const now = Date.now();
  return snap.docs
    .map((d) => mapAnnouncement(d.id, d.data()))
    .filter((a) => {
      // Check schedule window
      if (a.startTime > 0 && now < a.startTime) return false;
      if (a.endTime > 0 && now > a.endTime) return false;
      return true;
    });
}

/**
 * Real-time listener for active announcements (customer-facing).
 * Filters published + currently within schedule window client-side
 * to avoid complex Firestore compound queries.
 */
export function subscribeActiveAnnouncements(
  cb: (announcements: Announcement[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const now = Date.now();
  return onSnapshot(
    query(
      collection(getDb(), ANNOUNCEMENTS_COL),
      where("published", "==", true),
      orderBy("order", "asc"),
    ),
    (snap) => {
      const current = Date.now();
      const active = snap.docs
        .map((d) => mapAnnouncement(d.id, d.data()))
        .filter((a) => {
          if (a.startTime > 0 && current < a.startTime) return false;
          if (a.endTime > 0 && current > a.endTime) return false;
          return true;
        });
      cb(active);
    },
    (error: Error) => {
      console.warn("[announcements] snapshot error:", error);
      onError?.(error);
    },
  );
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Is an announcement currently active?
// ═══════════════════════════════════════════════════════════════

export function isAnnouncementActive(a: Announcement, now = Date.now()): boolean {
  if (!a.published) return false;
  if (a.startTime > 0 && now < a.startTime) return false;
  if (a.endTime > 0 && now > a.endTime) return false;
  return true;
}
