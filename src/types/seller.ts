// ====================================================================
// AVENTA SHOP Seller Types — Phase 2B Extended
// ====================================================================

/**
 * Seller lifecycle statuses.
 * Registration starts at "draft", moves through review stages.
 */
export type SellerStatus =
  | "draft" // Registration in progress
  | "pending_review" // Submitted, awaiting admin
  | "need_documents" // Admin requested more docs
  | "approved" // Active seller
  | "suspended" // Temporarily disabled
  | "rejected" // Application denied
  | "blocked"; // Permanently banned

/**
 * Registration step tracking for the multi-step wizard.
 */
export type RegistrationStep =
  | "account" // Step 1: Account (auto from Firebase auth)
  | "store_info" // Step 2: Store Information
  | "business_info" // Step 3: Business Information
  | "identity_verification" // Step 4: Identity Verification
  | "banking" // Step 5: Bank / Mobile Banking
  | "terms" // Step 6: Terms Accept
  | "submitted" // Step 7: Pending Review
  | "complete"; // Approved

export const REGISTRATION_STEPS: { key: RegistrationStep; label: string }[] = [
  { key: "account", label: "Account" },
  { key: "store_info", label: "Store Info" },
  { key: "business_info", label: "Business" },
  { key: "identity_verification", label: "Verify Identity" },
  { key: "banking", label: "Banking" },
  { key: "terms", label: "Terms" },
  { key: "submitted", label: "Review" },
];

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
// Seller Identity Verification
// ----------------------------------------------------------------------
export interface SellerIdentityInfo {
  fullName: string | null;
  nidNumber: string | null;
  nidFrontUrl: string | null;
  nidBackUrl: string | null;
  tradeLicenseUrl: string | null;
  tradeLicenseNumber: string | null;
  verified: boolean;
}

// ----------------------------------------------------------------------
// Seller Business Info
// ----------------------------------------------------------------------
export interface SellerBusinessInfo {
  businessType: "individual" | "company" | "partnership" | null;
  businessName: string | null;
  taxId: string | null;
  website: string | null;
  socialMediaLinks: string[];
}

// ----------------------------------------------------------------------
// Seller Store Settings
// ----------------------------------------------------------------------
export interface SellerStoreSettings {
  autoAcceptOrders: boolean;
  announcement: string | null;
  responseTimeHours: number;
  returnPolicyDays: number;
  operatingHours: string | null;
}

// ----------------------------------------------------------------------
// Future-Ready: Logistics
// ----------------------------------------------------------------------
export interface WarehouseInfo {
  id: string;
  name: string;
  address: string;
  city: string;
  area: string;
  isPrimary: boolean;
  pickupEnabled: boolean;
}

export interface PickupPoint {
  id: string;
  name: string;
  address: string;
  city: string;
  area: string;
  phone: string;
  active: boolean;
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
  bannerUrl: string | null;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  area: string | null;
  country: string;
  postalCode: string | null;
  status: SellerStatus;
  rejectionReason?: string | null;
  currentStep: RegistrationStep;
  termsAccepted: boolean;
  termsAcceptedAt: number | null;
  submittedAt: number | null;
  approvedAt: number | null;

  // Commission (server-controlled, seller cannot edit)
  commissionRate: number;

  // Balances (denormalized from walletTx ledger, server-controlled)
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  withdrawnTotal: number;

  // Payout
  bankInfo: SellerBankInfo;

  // Identity
  identity: SellerIdentityInfo;

  // Business
  business: SellerBusinessInfo;

  // Store
  storeSettings: SellerStoreSettings;
  verified: boolean;

  // Denormalized counts
  totalProducts: number;
  totalOrders: number;
  rating: number;
  ratingCount: number;
  followers: number;

  // Future-Ready: Logistics
  warehouses: WarehouseInfo[];
  pickupPoints: PickupPoint[];

  // Future-Ready: Currency & Shipping
  supportedCurrencies: string[];
  internationalShipping: boolean;
  crossBorderSeller: boolean;

  createdAt: number;
  updatedAt: number;
}

// ----------------------------------------------------------------------
// Seller Wallet Transactions
// ----------------------------------------------------------------------
export type SellerWalletTxType = "earning" | "withdrawal" | "adjustment" | "refund" | "bonus";

export type SellerWalletTxStatus = "completed" | "pending" | "failed";

export interface SellerWalletTx {
  id: string;
  type: SellerWalletTxType;
  amount: number;
  orderId: string | null;
  note: string;
  status: SellerWalletTxStatus;
  createdAt: number;
}

// ----------------------------------------------------------------------
// Withdrawal Requests
// ----------------------------------------------------------------------
export type WithdrawalMethod = "bank" | "bkash" | "nagad" | "rocket";
export type WithdrawalStatus = "pending" | "processing" | "completed" | "rejected";

export interface WithdrawalRequest {
  id: string;
  sellerId: string;
  amount: number;
  method: WithdrawalMethod;
  destination: string;
  status: WithdrawalStatus;
  requestedAt: number;
  processedAt: number | null;
  note: string | null;
  txId: string | null;
}

// ----------------------------------------------------------------------
// Shipping / Courier (Future Multi-Courier Ready)
// ----------------------------------------------------------------------
export type CourierProvider =
  "pathao" | "steadfast" | "redx" | "paperfly" | "sundarban" | "shopnexa_logistics" | "other";

export type ShippingStatus =
  | "pending"
  | "packed"
  | "handed_over"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "returned";

export interface ShippingInfo {
  courier: CourierProvider | null;
  trackingNumber: string | null;
  shippingCharge: number;
  status: ShippingStatus;
  shippedAt: number | null;
  deliveredAt: number | null;
  estimatedDays: number | null;
  warehouseId: string | null; // Future: which warehouse shipped
}

// ----------------------------------------------------------------------
// Seller Notification (Extended)
// ----------------------------------------------------------------------
export type SellerNotificationType =
  | "new_order"
  | "order_cancelled"
  | "order_returned"
  | "payment_released"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "stock_low"
  | "admin_message"
  | "coupon_expired"
  | "review_received"
  | "product_approved"
  | "product_rejected"
  | "system"
  | "approval";

export interface SellerNotification {
  id: string;
  type: SellerNotificationType;
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
  "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "returned";

export interface SellerOrderTracking {
  status: SellerOrderStatus;
  note: string;
  at: number;
}

export interface SellerOrder {
  id: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string | null;
  items: SellerOrderItem[];
  subtotal: number;
  status: SellerOrderStatus;
  commission: number;
  earnings: number;
  discount: number;
  tax: number;
  taxLabel: string;
  platformFee: number;
  total: number;
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
  shopnexa_logistics: { label: "AVENTA SHOP Logistics", color: "#f57224", website: "" },
  other: { label: "Other", color: "#6b7280", website: "" },
};

// ----------------------------------------------------------------------
// Store Status Display Config
// ----------------------------------------------------------------------
export const SELLER_STATUS_CONFIG: Record<
  SellerStatus,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  draft: { label: "Draft", color: "#64748b", bgColor: "#f1f5f9", icon: "✏️" },
  pending_review: { label: "Pending Review", color: "#d97706", bgColor: "#fffbeb", icon: "⏳" },
  need_documents: { label: "Need Documents", color: "#dc2626", bgColor: "#fef2f2", icon: "📄" },
  approved: { label: "Approved", color: "#059669", bgColor: "#ecfdf5", icon: "✅" },
  suspended: { label: "Suspended", color: "#dc2626", bgColor: "#fef2f2", icon: "⏸️" },
  rejected: { label: "Rejected", color: "#dc2626", bgColor: "#fef2f2", icon: "❌" },
  blocked: { label: "Blocked", color: "#991b1b", bgColor: "#fee2e2", icon: "🚫" },
};

// ----------------------------------------------------------------------
// Notification Type Display Config
// ----------------------------------------------------------------------
export const NOTIFICATION_TYPE_CONFIG: Record<
  SellerNotificationType,
  { label: string; icon: string; color: string }
> = {
  new_order: { label: "New Order", icon: "📦", color: "#059669" },
  order_cancelled: { label: "Cancelled", icon: "❌", color: "#dc2626" },
  order_returned: { label: "Return", icon: "↩️", color: "#d97706" },
  payment_released: { label: "Payment", icon: "💰", color: "#059669" },
  withdrawal_approved: { label: "Withdrawal", icon: "✅", color: "#059669" },
  withdrawal_rejected: { label: "Withdrawal", icon: "❌", color: "#dc2626" },
  stock_low: { label: "Low Stock", icon: "⚠️", color: "#d97706" },
  admin_message: { label: "Admin", icon: "📢", color: "#0f172a" },
  coupon_expired: { label: "Coupon", icon: "🏷️", color: "#64748b" },
  review_received: { label: "Review", icon: "⭐", color: "#f59e0b" },
  product_approved: { label: "Product", icon: "✅", color: "#059669" },
  product_rejected: { label: "Product", icon: "❌", color: "#dc2626" },
  system: { label: "System", icon: "🔔", color: "#64748b" },
  approval: { label: "Approval", icon: "🔐", color: "#f57224" },
};
