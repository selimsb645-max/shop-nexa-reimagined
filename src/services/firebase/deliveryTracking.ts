import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Order } from "@/types/commerce";

export interface DeliveryLocation {
  lat: number;
  lng: number;
  updatedAt: number;
}

export interface DeliveryTracking {
  orderId: string;
  deliveryPartnerId: string;
  deliveryPartnerName: string;
  status: "assigned" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "failed";
  currentLocation: DeliveryLocation | null;
  estimatedDeliveryTime: number | null;
  notes: string[];
  createdAt: number;
  updatedAt: number;
}

export async function getDeliveryTracking(orderId: string): Promise<DeliveryTracking | null> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, "deliveryTracking"),
      where("orderId", "==", orderId),
    ),
  );
  if (snap.empty) return null;
  const data = snap.docs[0].data() as Record<string, unknown>;
  return {
    orderId: String(data.orderId ?? ""),
    deliveryPartnerId: String(data.deliveryPartnerId ?? ""),
    deliveryPartnerName: String(data.deliveryPartnerName ?? ""),
    status: (data.status as DeliveryTracking["status"]) ?? "assigned",
    currentLocation: data.currentLocation
      ? {
          lat: Number((data.currentLocation as Record<string, unknown>).lat ?? 0),
          lng: Number((data.currentLocation as Record<string, unknown>).lng ?? 0),
          updatedAt: Number((data.currentLocation as Record<string, unknown>).updatedAt ?? 0),
        }
      : null,
    estimatedDeliveryTime:
      typeof data.estimatedDeliveryTime === "number" ? data.estimatedDeliveryTime : null,
    notes: Array.isArray(data.notes) ? (data.notes as string[]) : [],
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
    updatedAt:
      typeof data.updatedAt === "number"
        ? data.updatedAt
        : (data.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
  };
}

export async function listOrdersForTracking(uid: string): Promise<Order[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, "orders"),
      where("userId", "==", uid),
      where("status", "in", ["shipped", "delivered"]),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      userId: String(data.userId ?? ""),
      items: Array.isArray(data.items) ? data.items : [],
      subtotal: Number(data.subtotal ?? 0),
      discount: Number(data.discount ?? 0),
      shipping: Number(data.shipping ?? 0),
      total: Number(data.total ?? 0),
      couponCode: (data.couponCode as string | null) ?? null,
      status: (data.status as Order["status"]) ?? "pending",
      payment: (data.payment as Order["payment"]) ?? { method: "cash_on_delivery", status: "unpaid", provider: null, transactionId: null, paidAt: null },
      shippingAddress: (data.shippingAddress as Order["shippingAddress"]) ?? { fullName: "", phone: "", addressLine: "", city: "", postalCode: "", country: "" },
      tracking: Array.isArray(data.tracking) ? data.tracking : [],
      createdAt:
        typeof data.createdAt === "number"
          ? data.createdAt
          : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
      updatedAt:
        typeof data.updatedAt === "number"
          ? data.updatedAt
          : (data.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
    };
  });
}
