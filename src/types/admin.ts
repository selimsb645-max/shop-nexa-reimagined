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
