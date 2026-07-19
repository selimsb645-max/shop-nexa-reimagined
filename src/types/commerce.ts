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
  description: string;
  price: number;
  compareAtPrice: number | null;
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
  createdAt: number;
  updatedAt: number;
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
  // snapshot for fast render
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
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

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
  status: OrderStatus;
  note: string;
  at: number;
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
  tracking: TrackingEvent[];
  createdAt: number;
  updatedAt: number;
}

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
}
