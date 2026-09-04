/**
 * Aventa Shop — Order Tracking Client Service (Phase 1)
 *
 * Client-side read/write helpers for the tracking system.
 * Status mutations go through server functions (order-tracking.functions.ts).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import { generateTrackingId } from "@/lib/tracking-utils";
import type {
  TrackingOrderStatus,
  StatusHistoryEntry,
  DeliveryAgent,
  DeliveryInfo,
} from "@/types/tracking";
import { updateOrderStatus, assignDeliveryAgent } from "@/lib/order-tracking.functions";

// ====================================================================
// REAL-TIME ORDER LISTENER
// ====================================================================

/**
 * Subscribe to real-time order updates.
 * Returns an unsubscribe function.
 */
export function subscribeToOrder(
  uid: string,
  orderId: string,
  callback: (order: Record<string, unknown> | null) => void,
): () => void {
  const db = getDb();
  const ref = doc(db, "users", uid, "orders", orderId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as Record<string, unknown>);
    } else {
      callback(null);
    }
  });
}

/**
 * Subscribe to real-time status history for an order.
 */
export function subscribeToStatusHistory(
  trackingId: string,
  callback: (history: StatusHistoryEntry[]) => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "orderStatusHistory"),
    where("trackingId", "==", trackingId.toUpperCase()),
    orderBy("timestamp", "asc"),
  );
  return onSnapshot(q, (snap) => {
    const entries: StatusHistoryEntry[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: String(data.id ?? d.id),
        orderId: String(data.orderId ?? ""),
        trackingId: String(data.trackingId ?? ""),
        status: data.status as TrackingOrderStatus,
        previousStatus: (data.previousStatus as TrackingOrderStatus | null) ?? null,
        updatedBy: String(data.updatedBy ?? ""),
        updatedByRole: data.updatedByRole as StatusHistoryEntry["updatedByRole"],
        note: String(data.note ?? ""),
        timestamp: Number(data.timestamp ?? 0),
      };
    });
    callback(entries);
  });
}

// ====================================================================
// STATUS HISTORY READ
// ====================================================================

export async function getStatusHistory(trackingId: string): Promise<StatusHistoryEntry[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, "orderStatusHistory"),
      where("trackingId", "==", trackingId.toUpperCase()),
      orderBy("timestamp", "asc"),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: String(data.id ?? d.id),
      orderId: String(data.orderId ?? ""),
      trackingId: String(data.trackingId ?? ""),
      status: data.status as TrackingOrderStatus,
      previousStatus: (data.previousStatus as TrackingOrderStatus | null) ?? null,
      updatedBy: String(data.updatedBy ?? ""),
      updatedByRole: data.updatedByRole as StatusHistoryEntry["updatedByRole"],
      note: String(data.note ?? ""),
      timestamp: Number(data.timestamp ?? 0),
    };
  });
}

// ====================================================================
// TRACKING ID HELPERS
// ====================================================================

/**
 * Generates a tracking ID for an existing order that doesn't have one.
 * This is a client-side call that the seller/admin can trigger.
 */
export function generateNewTrackingId(): string {
  return generateTrackingId();
}

// ====================================================================
// STATUS UPDATE (through server function)
// ====================================================================

export async function updateOrderStatusServer(params: {
  idToken: string;
  orderId: string;
  newStatus: TrackingOrderStatus;
  note?: string;
  expectedDeliveryDate?: number;
}): Promise<{
  success: boolean;
  orderId: string;
  trackingId: string;
  previousStatus: string;
  newStatus: string;
  timestamp: number;
}> {
  return updateOrderStatus({
    data: {
      idToken: params.idToken,
      orderId: params.orderId,
      newStatus: params.newStatus,
      note: params.note ?? "",
      ...(params.expectedDeliveryDate ? { expectedDeliveryDate: params.expectedDeliveryDate } : {}),
    },
  });
}

// ====================================================================
// DELIVERY AGENT ASSIGNMENT (through server function)
// ====================================================================

export async function assignDeliveryAgentServer(params: {
  idToken: string;
  orderId: string;
  agentId: string;
  expectedDeliveryDate?: number;
}): Promise<{
  success: boolean;
  agentName: string;
  agentPhone: string;
  expectedDeliveryDate: number;
}> {
  return assignDeliveryAgent({
    data: {
      idToken: params.idToken,
      orderId: params.orderId,
      agentId: params.agentId,
      ...(params.expectedDeliveryDate ? { expectedDeliveryDate: params.expectedDeliveryDate } : {}),
    },
  });
}

// ====================================================================
// DELIVERY AGENT CRUD
// ====================================================================

export async function listDeliveryAgents(): Promise<DeliveryAgent[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "deliveryAgents")));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: String(data.name ?? ""),
      phone: String(data.phone ?? ""),
      email: (data.email as string | null) ?? null,
      status: (data.status as DeliveryAgent["status"]) ?? "offline",
      assignedOrderIds: (data.assignedOrderIds as string[]) ?? [],
      createdAt: Number(data.createdAt ?? 0),
      updatedAt: Number(data.updatedAt ?? 0),
    };
  });
}

export async function getDeliveryAgent(agentId: string): Promise<DeliveryAgent | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "deliveryAgents", agentId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    name: String(data.name ?? ""),
    phone: String(data.phone ?? ""),
    email: (data.email as string | null) ?? null,
    status: (data.status as DeliveryAgent["status"]) ?? "offline",
    assignedOrderIds: (data.assignedOrderIds as string[]) ?? [],
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
  };
}

/**
 * Subscribe to real-time delivery agent updates.
 */
export function subscribeToDeliveryAgent(
  agentId: string,
  callback: (agent: DeliveryAgent | null) => void,
): () => void {
  const db = getDb();
  return onSnapshot(doc(db, "deliveryAgents", agentId), (snap) => {
    if (!snap.exists()) return callback(null);
    const data = snap.data() as Record<string, unknown>;
    callback({
      id: snap.id,
      name: String(data.name ?? ""),
      phone: String(data.phone ?? ""),
      email: (data.email as string | null) ?? null,
      status: (data.status as DeliveryAgent["status"]) ?? "offline",
      assignedOrderIds: (data.assignedOrderIds as string[]) ?? [],
      createdAt: Number(data.createdAt ?? 0),
      updatedAt: Number(data.updatedAt ?? 0),
    });
  });
}

// ====================================================================
// DELIVERY INFO EXTRACTION
// ====================================================================

export function extractDeliveryInfo(orderData: Record<string, unknown>): DeliveryInfo | null {
  const raw = orderData["deliveryInfo"] as Record<string, unknown> | undefined;
  if (!raw) return null;
  return {
    deliveryAgentId: (raw.deliveryAgentId as string | null) ?? null,
    deliveryAgentName: (raw.deliveryAgentName as string | null) ?? null,
    deliveryAgentPhone: (raw.deliveryAgentPhone as string | null) ?? null,
    assignedAt: (raw.assignedAt as number | null) ?? null,
    pickedUpAt: (raw.pickedUpAt as number | null) ?? null,
    outForDeliveryAt: (raw.outForDeliveryAt as number | null) ?? null,
    deliveredAt: (raw.deliveredAt as number | null) ?? null,
    expectedDeliveryDate: (raw.expectedDeliveryDate as number | null) ?? null,
  };
}

// ====================================================================
// AGENT'S ASSIGNED ORDERS — real-time listener
// ====================================================================

/**
 * Get all orders assigned to a delivery agent (real-time).
 */
export function subscribeToAgentOrders(
  agentId: string,
  callback: (orders: Array<Record<string, unknown>>) => void,
): () => void {
  const db = getDb();
  const agentRef = doc(db, "deliveryAgents", agentId);
  return onSnapshot(agentRef, async (snap) => {
    if (!snap.exists()) return callback([]);
    const data = snap.data() as Record<string, unknown>;
    const orderIds = (data.assignedOrderIds as string[]) ?? [];
    if (orderIds.length === 0) return callback([]);

    // Fetch each order — we need to search across users
    // Since orders are in users/{uid}/orders/{orderId}, we use collectionGroup
    const ordersSnap = await getDocs(query(collection(db, "users")));
    // This is inefficient — for Phase 1 we fetch by iterating
    // TODO: Phase 2 — add a deliveryAssignments collection for efficient lookup
    const orders: Array<Record<string, unknown>> = [];
    for (const userDoc of ordersSnap.docs) {
      for (const oid of orderIds) {
        const orderSnap = await getDoc(doc(db, "users", userDoc.id, "orders", oid));
        if (orderSnap.exists()) {
          orders.push({ id: orderSnap.id, userId: userDoc.id, ...orderSnap.data() });
        }
      }
    }
    callback(orders);
  });
}
