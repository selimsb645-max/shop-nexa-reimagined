/**
 * Seed default announcements.
 *
 * These mirror the original hardcoded announcements that were displayed
 * in the AnnouncementCenter component before the dynamic system was built.
 * Run once via admin dashboard or a migration script to populate the
 * "announcements" Firestore collection.
 */

import { createAnnouncement, type AnnouncementInput } from "./adminAnnouncements";

export const DEFAULT_ANNOUNCEMENTS: AnnouncementInput[] = [
  {
    title: "Mega Flash Sale",
    message: "Up to 70% off on electronics, fashion & more!",
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
  },
  {
    title: "New Seller Programs",
    message: "Join AVENTA SHOP as a seller and reach millions of customers",
    type: "info",
    priority: "normal",
    gradient: "from-blue-500 to-indigo-600",
    icon: "Store",
    ctaLabel: "Become a Seller",
    ctaLink: "/seller/register",
    published: true,
    startTime: 0,
    endTime: 0,
    order: 1,
  },
  {
    title: "AVENTA Prime Membership",
    message: "Free shipping, exclusive deals & 3x reward points",
    type: "promo",
    priority: "normal",
    gradient: "from-purple-500 to-pink-600",
    icon: "Sparkles",
    ctaLabel: "Join Now",
    ctaLink: "/membership",
    published: true,
    startTime: 0,
    endTime: 0,
    order: 2,
  },
  {
    title: "Gift Cards Available",
    message: "Perfect gifts for any occasion — starting from ৳500",
    type: "info",
    priority: "low",
    gradient: "from-green-500 to-teal-600",
    icon: "Gift",
    ctaLabel: "Buy Gift Card",
    ctaLink: "/gift-cards",
    published: true,
    startTime: 0,
    endTime: 0,
    order: 3,
  },
  {
    title: "System Maintenance",
    message: "Scheduled maintenance on Aug 10, 2:00 AM - 4:00 AM BST",
    type: "system",
    priority: "urgent",
    gradient: "from-gray-600 to-gray-800",
    icon: "AlertCircle",
    ctaLabel: null,
    ctaLink: null,
    published: true,
    startTime: 0,
    endTime: 0,
    order: 4,
  },
];

export async function seedDefaultAnnouncements(adminUid: string): Promise<void> {
  for (const input of DEFAULT_ANNOUNCEMENTS) {
    await createAnnouncement(input, adminUid);
  }
}
