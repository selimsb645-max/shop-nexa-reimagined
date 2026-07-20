export type SellerStatus = "pending" | "approved" | "rejected" | "suspended";

export interface SellerProfile {
  uid: string;
  shopName: string;
  shopSlug: string;
  description: string;
  logoUrl: string | null;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  country: string;
  status: SellerStatus;
  rejectionReason?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SellerNotification {
  id: string;
  type: "order" | "product" | "system" | "approval";
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  createdAt: number;
}

export interface SellerOrderItem {
  productId: string;
  slug: string;
  title: string;
  image: string;
  price: number;
  quantity: number;
  subtotal: number;
  sku?: string | null;
  variant?: { color?: string | null; size?: string | null } | null;
}

export type SellerOrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface SellerOrderTracking {
  status: SellerOrderStatus;
  note: string;
  at: number;
}

export interface SellerOrder {
  id: string; // same as buyer order id
  sellerId: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string | null;
  items: SellerOrderItem[];
  subtotal: number;
  status: SellerOrderStatus;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine: string;
    city: string;
    postalCode: string;
    country: string;
    notes?: string;
  };
  paymentMethod: string;
  paymentStatus: string;
  tracking: SellerOrderTracking[];
  createdAt: number;
  updatedAt: number;
}
