export interface Category {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  order: number;
  /** Category-level base commission rate (0-1, e.g. 0.0645 = 6.45%). Source: 50% of Daraz New Rate. */
  commissionRate?: number | null;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  order: number;
  /** Subcategory commission override (0-1). Takes priority over category base rate. Source: 50% of Daraz New Rate. */
  commissionRate?: number | null;
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  shortDescription: string; // NEW: short description for cards/previews
  description: string;
  brand: string | null; // NEW: product brand
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null; // NEW: seller/admin only
  tax: number; // NEW: tax percentage (0-100)
  images: string[];
  categoryId: string;
  categorySlug: string;
  subcategoryId: string | null;
  subcategorySlug: string | null;
  stock: number;
  rating: number;
  reviewCount: number;
  tags: string[];
  featured: boolean;
  freeDelivery: boolean; // Seller-controlled: true = seller pays zone charge, false = customer pays
  sellerId?: string | null;
  sku?: string | null;
  status?: "draft" | "published" | "archived";
  colors?: string[];
  sizes?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Coupon {
  // Seller coupon fields (null = marketplace-wide admin coupon)
  sellerId: string | null;
  productIds: string[];
  maxDiscount: number | null;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  userPhoto: string | null;
  rating: number;
  title: string;
  comment: string;
  createdAt: number;
  isApproved: boolean;
  productTitle?: string;
  productImage?: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
  addedAt: number;
  title: string;
  image: string;
  price: number;
  slug: string;
  stock: number;
}

export interface WishlistItem {
  productId: string;
  addedAt: number;
  title: string;
  image: string;
  price: number;
  slug: string;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
  notes?: string;
}

export type PaymentMethod = "cash_on_delivery" | "card" | "mobile_banking";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "refunded" | "failed";

export interface PaymentInfo {
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string | null;
  transactionId: string | null;
  paidAt: number | null;
}

export type OrderStatus =
  "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";

export interface OrderItem {
  productId: string;
  slug: string;
  title: string;
  image: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface TrackingEvent {
  status: OrderStatus | "out_for_delivery";
  note: string;
  at: number;
}

export interface CourierInfo {
  name: string | null; // Courier company name (e.g. "Steadfast", "RedX")
  trackingNumber: string | null; // Tracking number from courier
  trackingUrl: string | null; // Optional URL to track on courier site
  shippedAt: number | null; // Timestamp when handed to courier
  estimatedDays: number | null; // Estimated delivery days
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  taxRate: number;
  taxLabel: string;
  total: number;
  platformFee: number;
  promoDiscount: number;
  rewardDiscount: number;
  walletUsed: number;
  couponCode: string | null;
  promoCode: string | null;
  status: OrderStatus;
  payment: PaymentInfo;
  shippingAddress: ShippingAddress;
  deliveryAddressSnapshot?: DeliveryAddressSnapshot | null;
  // Delivery zone snapshot (saved at checkout, never recalculated)
  deliveryZone?: string | null; // "INSIDE_DHAKA" | "DHAKA_SUBURB" | "OUTSIDE_DHAKA"
  deliveryZoneId?: string | null; // Zone ID at order time
  deliveryZoneName?: string | null; // Zone name at order time
  deliveryZoneLabel?: string | null; // Human-readable label
  deliveryCharge?: number | null; // Charge at time of order (BDT)
  zoneCharge?: number | null; // Admin-configured zone charge snapshot
  customerDeliveryCharge?: number | null; // What customer paid for delivery
  sellerDeliveryCharge?: number | null; // What seller(s) absorbed
  deliverySnapshot?: {
    zoneId: string;
    zoneName: string;
    zoneCharge: number;
    customerDeliveryCharge: number;
    sellerDeliveryCharge: number;
    labelBn: string;
    etaDays: [number, number];
    deliveryLines?: Array<{
      productId: string;
      sellerId: string;
      freeDelivery: boolean;
      zoneCharge: number;
      customerDeliveryCharge: number;
      sellerAbsorbedCharge: number;
    }>;
  } | null;
  tracking: TrackingEvent[];
  courierInfo?: CourierInfo | null;
  createdAt: number;
  updatedAt: number;
}

import type { DeliveryAddressSnapshot } from "./address";

export type CouponType = "percent" | "fixed";

export interface Coupon {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  expiresAt: number | null;
  active: boolean;
  usageLimit: number | null;
  uses: number;
  sellerId: string | null;
  productIds: string[];
  maxDiscount: number | null;
  // ── Coupon v2 (additive; older docs default these to null/[]) ──
  /** window start, epoch ms — null/0 = open start */
  startAt?: number | null;
  /** per-customer usage limit — null = unlimited */
  perCustomerLimit?: number | null;
  /** category scope — empty = no category restriction */
  categoryIds?: string[];
  createdAt?: number;
  updatedAt?: number;
}
