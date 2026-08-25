export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
  notes?: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NotificationType = "order" | "promo" | "wallet" | "reward" | "support" | "system";

export interface CustomerNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: number;
}

export interface MessageThread {
  id: string;
  subject: string;
  participant: string; // "AVENTA SHOP Support" or seller shop name
  sellerId: string | null;
  lastMessage: string;
  lastAt: number;
  unread: number;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  body: string;
  from: "customer" | "support";
  createdAt: number;
}

export type WalletTxType = "cashback" | "refund" | "topup" | "spend" | "adjustment";

export interface WalletTx {
  id: string;
  type: WalletTxType;
  amount: number; // positive = credit, negative = debit
  note: string;
  orderId: string | null;
  createdAt: number;
}

export type RewardTxType = "earn" | "redeem" | "bonus" | "referral";

export interface RewardTx {
  id: string;
  type: RewardTxType;
  points: number; // positive = earned, negative = redeemed
  note: string;
  orderId: string | null;
  createdAt: number;
}

export interface ReferralRecord {
  id: string;
  referredUserId: string;
  referredName: string;
  status: "joined" | "ordered";
  createdAt: number;
}

export type TicketStatus = "open" | "pending" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  subject: string;
  category: "order" | "payment" | "delivery" | "account" | "other";
  orderId: string | null;
  status: TicketStatus;
  lastMessage: string;
  createdAt: number;
  updatedAt: number;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  body: string;
  from: "customer" | "support";
  createdAt: number;
}

export interface CustomerSettings {
  emailOrderUpdates: boolean;
  emailPromotions: boolean;
  smsOrderUpdates: boolean;
  pushNotifications: boolean;
  currency: "USD" | "BDT";
  language: "en" | "bn";
  updatedAt: number;
}

export const DEFAULT_SETTINGS: CustomerSettings = {
  emailOrderUpdates: true,
  emailPromotions: false,
  smsOrderUpdates: true,
  pushNotifications: true,
  currency: "BDT",
  language: "en",
  updatedAt: 0,
};

// ------------------------------------------------------------------
// Seller Conversation (top-level shared collection)
// ------------------------------------------------------------------
export interface SellerConversation {
  id: string;
  customerId: string;
  sellerId: string;
  customerName: string;
  sellerShopName: string;
  subject: string;
  lastMessage: string;
  lastAt: number;
  customerUnread: number;
  sellerUnread: number;
  createdAt: number;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  from: "customer" | "seller";
  senderId: string;
  body: string;
  createdAt: number;
}
