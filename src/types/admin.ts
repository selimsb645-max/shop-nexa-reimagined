export interface SiteSettings {
  siteName: string;
  supportEmail: string;
  supportPhone: string;
  whatsappNumber: string;
  facebookUrl: string;
  currency: string;
  shipping: {
    flatRate: number;
    freeShippingThreshold: number;
    enabled: boolean;
  };
  cod: {
    enabled: boolean;
    minOrder: number;
    maxOrder: number;
    note: string;
  };
  tax: {
    enabled: boolean;
    /** Global tax rate (percentage 0-100). Applied to subtotal after discounts. */
    rate: number;
    /** Tax label shown to customers (e.g. "VAT", "Tax", "GST") */
    label: string;
    /** Whether per-product tax overrides the global rate */
    perProductOverride: boolean;
  };
  homepage: {
    heroHeadline: string;
    heroSubheadline: string;
    heroCtaLabel: string;
    heroCtaLink: string;
    featuredCategorySlugs: string[];
  };
  updatedAt: number;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel: string;
  ctaLink: string;
  position: "hero" | "middle" | "footer";
  active: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}



// ═══════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════

export type AnnouncementType = "promo" | "info" | "system" | "event";
export type AnnouncementPriority = "low" | "normal" | "high" | "urgent";

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  /** Visual style for the card */
  gradient: string;
  /** Icon identifier (lucide icon name) */
  icon: string;
  /** CTA button label (null = no button) */
  ctaLabel: string | null;
  /** CTA link (null = no link) */
  ctaLink: string | null;
  /** Published status — only published=true AND within schedule shows to users */
  published: boolean;
  /** Schedule start (epoch ms). 0 = immediately */
  startTime: number;
  /** Schedule end (epoch ms). 0 = never expires */
  endTime: number;
  /** Display order (lower = first). Default 0 */
  order: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export type ActivityAction =
  | "user.block"
  | "user.unblock"
  | "user.role_change"
  | "seller.approve"
  | "seller.reject"
  | "seller.suspend"
  | "seller.reinstate"
  | "product.approve"
  | "product.reject"
  | "product.delete"
  | "product.bulk_update"
  | "product.create"
  | "product.update"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "coupon.create"
  | "coupon.update"
  | "coupon.delete"
  | "banner.create"
  | "banner.update"
  | "banner.delete"
  | "announcement.create"
  | "announcement.update"
  | "announcement.delete"
  | "order.status_update"
  | "order.cancel"
  | "settings.update";

export interface ActivityLog {
  id: string;
  actorUid: string;
  actorEmail: string | null;
  action: ActivityAction;
  target: string;
  details: string;
  createdAt: number;
}
