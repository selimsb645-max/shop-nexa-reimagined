export type SellerStatus = "pending" | "approved" | "rejected" | "suspended";

// ----------------------------------------------------------------------
// Seller Bank / Payout Info
// ----------------------------------------------------------------------
export interface SellerBankInfo {
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  branchName: string | null;
  routingNumber: string | null;
  mobileBankingType: "bkash" | "nagad" | "rocket" | null;
  mobileBankingNumber: string | null;
}

// ----------------------------------------------------------------------
// Seller Store Settings
// ----------------------------------------------------------------------
export interface SellerStoreSettings {
  autoAcceptOrders: boolean;
  announcement: string | null;
  responseTimeHours: number;
  returnPolicyDays: number;
}

// ----------------------------------------------------------------------
// Extended Seller Profile
// ----------------------------------------------------------------------
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

  // Commission
  commissionRate: number; // e.g. 0.08 = 8%

  // Balances (denormalized from walletTx ledger)
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  withdrawnTotal: number;

  // Payout
  bankInfo: SellerBankInfo;

  // Store
  storeSettings: SellerStoreSettings;
  verified: boolean;

  // Denormalized counts
  totalProducts: number;
  totalOrders: number;
  rating: number;
  ratingCount: number;

  createdAt: number;
  updatedAt: number;
}

// ----------------------------------------------------------------------
// Seller Wallet Transactions
// ----------------------------------------------------------------------
export type SellerWalletTxType =
  | "earning"
  | "withdrawal"
  | "adjustment"
  | "refund"
  | "bonus";

export type SellerWalletTxStatus = "completed" | "pending" | "failed";

export interface SellerWalletTx {
  id: string;
  type: SellerWalletTxType;
  amount: number; // positive = credit, negative = debit
  orderId: string | null;
  note: string;
  status: SellerWalletTxStatus;
  createdAt: number;
}

// ----------------------------------------------------------------------
// Withdrawal Requests
// ----------------------------------------------------------------------
export type WithdrawalMethod = "bank" | "bkash" | "nagad" | "rocket";
export type WithdrawalStatus =
  | "pending"
  | "processing"
  | "completed"
  | "rejected";

export interface WithdrawalRequest {
  id: string;
  sellerId: string;
  amount: number;
  method: WithdrawalMethod;
  destination: string; // account number or mobile
  status: WithdrawalStatus;
  requestedAt: number;
  processedAt: number | null;
  note: string | null; // admin note
  txId: string | null; // reference to walletTx when completed
}

// ----------------------------------------------------------------------
// Shipping / Courier (Future Multi-Courier Ready)
// ----------------------------------------------------------------------
/**
 * Courier provider identifier. New couriers can be added to this union
 * without any database schema change — the shipping document just stores
 * the string. The UI maps these to display names and logos.
 */
export type CourierProvider =
  | "pathao"
  | "steadfast"
  | "redx"
  | "paperfly"
  | "sundarban"
  | "shopnexa_logistics"
  | "other";

export type ShippingStatus =
  | "pending"
  | "packed"
  | "handed_over"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "returned"
  ;

/**
 * Shipping info attached to seller orders. Fully extensible —
 * adding a new courier requires only adding to CourierProvider type.
 */
export interface ShippingInfo {
  courier: CourierProvider | null;
  trackingNumber: string | null;
  shippingCharge: number;
  status: ShippingStatus;
  shippedAt: number | null;
  deliveredAt: number | null;
  estimatedDays: number | null;
}

// ----------------------------------------------------------------------
// Extended Seller Notification
// ----------------------------------------------------------------------
export interface SellerNotification {
  id: string;
  type: "order" | "product" | "system" | "approval" | "withdrawal" | "shipping";
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  createdAt: number;
}

// ----------------------------------------------------------------------
// Seller Order (Extended)
// ----------------------------------------------------------------------
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

  // Commission & Earnings (calculated at order creation time)
  commission: number; // platform commission
  earnings: number; // subtotal - commission

  // Shipping (multi-courier ready)
  shipping: ShippingInfo;

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

// ----------------------------------------------------------------------
// Courier display config (for UI)
// ----------------------------------------------------------------------
export const COURIER_CONFIG: Record<
  CourierProvider,
  { label: string; color: string; website: string }
> = {
  pathao: { label: "Pathao", color: "#e63946", website: "https://pathao.com" },
  steadfast: { label: "SteadFast", color: "#1d3557", website: "https://steadfast.com.bd" },
  redx: { label: "RedX", color: "#e63946", website: "https://redx.com.bd" },
  paperfly: { label: "Paperfly", color: "#2a9d8f", website: "https://paperfly.com.bd" },
  sundarban: { label: "Sundarban", color: "#f4a261", website: "https://sundarbanltd.com" },
  shopnexa_logistics: { label: "Shop Nexa Logistics", color: "#f57224", website: "" },
  other: { label: "Other", color: "#6b7280", website: "" },
};
