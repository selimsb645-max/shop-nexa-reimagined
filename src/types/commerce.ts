export interface Category {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  order: number;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  order: number;
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
  total: number;
  couponCode: string | null;
  status: OrderStatus;
  payment: PaymentInfo;
  shippingAddress: ShippingAddress;
  deliveryAddressSnapshot?: DeliveryAddressSnapshot | null;
  // Delivery zone snapshot (saved at checkout, never recalculated)
  deliveryZone?: string | null; // "INSIDE_DHAKA" | "DHAKA_SUBURB" | "OUTSIDE_DHAKA"
  deliveryZoneLabel?: string | null; // Human-readable label
  deliveryCharge?: number | null; // Charge at time of order (BDT)
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
}
