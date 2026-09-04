/**
 * Aventa Shop — Smart Order Tracking System Types (Phase 1)
 *
 * Status-based tracking with immutable history, delivery agents,
 * and audit logging. Designed for future GPS extension.
 */

// ====================================================================
// ORDER STATUS — Extended
// ====================================================================

/**
 * Full order status lifecycle.
 * "pending" === "placed" (backward compat with existing orders).
 */
export type TrackingOrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "packed"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "return_requested"
  | "returned";

/**
 * Human-readable label for each status.
 */
export const STATUS_LABELS: Record<TrackingOrderStatus, string> = {
  pending: "Order Placed",
  confirmed: "Order Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return Requested",
  returned: "Returned",
};

/**
 * Short label for badges/chips.
 */
export const STATUS_SHORT: Record<TrackingOrderStatus, string> = {
  pending: "Placed",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return",
  returned: "Returned",
};

/**
 * Statuses that trigger customer notifications.
 */
export const NOTIFIABLE_STATUSES: TrackingOrderStatus[] = [
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

// ====================================================================
// STATUS HISTORY ENTRY
// ====================================================================

export type TrackingUserRole = "customer" | "seller" | "admin" | "delivery_agent";

export interface StatusHistoryEntry {
  id: string;
  orderId: string;
  trackingId: string;
  status: TrackingOrderStatus;
  previousStatus: TrackingOrderStatus | null;
  updatedBy: string;
  updatedByRole: TrackingUserRole;
  note: string;
  timestamp: number;
}

// ====================================================================
// AUDIT LOG ENTRY
// ====================================================================

export interface AuditLogEntry {
  id: string;
  orderId: string;
  trackingId: string;
  previousStatus: TrackingOrderStatus;
  newStatus: TrackingOrderStatus;
  changedBy: string;
  changedByRole: TrackingUserRole;
  timestamp: number;
  note: string;
}

// ====================================================================
// DELIVERY AGENT
// ====================================================================

export type DeliveryAgentStatus = "available" | "busy" | "offline";

export interface DeliveryAgent {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: DeliveryAgentStatus;
  assignedOrderIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ====================================================================
// DELIVERY INFO (on order document)
// ====================================================================

export interface DeliveryInfo {
  deliveryAgentId: string | null;
  deliveryAgentName: string | null;
  deliveryAgentPhone: string | null;
  assignedAt: number | null;
  pickedUpAt: number | null;
  outForDeliveryAt: number | null;
  deliveredAt: number | null;
  expectedDeliveryDate: number | null;
}

export const EMPTY_DELIVERY_INFO: DeliveryInfo = {
  deliveryAgentId: null,
  deliveryAgentName: null,
  deliveryAgentPhone: null,
  assignedAt: null,
  pickedUpAt: null,
  outForDeliveryAt: null,
  deliveredAt: null,
  expectedDeliveryDate: null,
};

// ====================================================================
// NOTIFICATION EVENT
// ====================================================================

export interface OrderNotificationEvent {
  id: string;
  orderId: string;
  trackingId: string;
  userId: string;
  event: string;
  status: TrackingOrderStatus;
  message: string;
  channel: string;
  delivered: boolean;
  error: string | null;
  createdAt: number;
}

// ====================================================================
// TRACKING TIMELINE STEP (for UI)
// ====================================================================

export interface TimelineStep {
  status: TrackingOrderStatus;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp: number | null;
  note: string | null;
}
