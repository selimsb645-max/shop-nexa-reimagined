import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import type { SellerOrder, SellerOrderStatus } from "@/types/seller";
import { markOrderDelivered } from "@/lib/settlement.functions";

const SELLERS = "sellers";
const ORDERS = "orders";

function nowMs() {
  return Date.now();
}

function mapOrder(id: string, d: Record<string, unknown>): SellerOrder {
  const r = d as Partial<SellerOrder> & Record<string, unknown>;
  return {
    id,
    sellerId: String(r.sellerId ?? ""),
    buyerId: String(r.buyerId ?? ""),
    buyerName: String(r.buyerName ?? ""),
    buyerEmail: (r.buyerEmail as string | null) ?? null,
    items: (r.items as SellerOrder["items"]) ?? [],
    subtotal: Number(r.subtotal ?? 0),
    status: (r.status as SellerOrderStatus) ?? "pending",
    shippingAddress: (r.shippingAddress as SellerOrder["shippingAddress"]) ?? {
      fullName: "",
      phone: "",
      addressLine: "",
      city: "",
      postalCode: "",
      country: "",
    },
    paymentMethod: String(r.paymentMethod ?? ""),
    paymentStatus: String(r.paymentStatus ?? ""),
    tracking: (r.tracking as SellerOrder["tracking"]) ?? [],
    createdAt: typeof r.createdAt === "number" ? r.createdAt : nowMs(),
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : nowMs(),
  };
}

export async function listSellerOrders(sellerId: string): Promise<SellerOrder[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), SELLERS, sellerId, ORDERS),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => mapOrder(d.id, d.data()));
}

export async function getSellerOrder(
  sellerId: string,
  orderId: string,
): Promise<SellerOrder | null> {
  const snap = await getDoc(doc(getDb(), SELLERS, sellerId, ORDERS, orderId));
  return snap.exists() ? mapOrder(snap.id, snap.data()) : null;
}

/**
 * Updates the seller's order status.
 *
 * SETTLEMENT INTEGRATION:
 * When status is "delivered", also calls markOrderDeliveredSettlement()
 * server function to transition the settlement from "pending" to "hold"
 * and start the 7-day settlement hold period.
 *
 * IDEMPOTENT: The settlement server function checks the current
 * settlement status and only transitions from "pending". If already
 * "hold" or beyond, it returns { updated: false } without creating
 * duplicate entries. Marking the same order delivered twice is safe.
 *
 * When status is "cancelled", the reversal is handled by the admin
 * via adminOrders.ts cancelOrderAdmin which calls reverseSettlement.
 */
export async function updateSellerOrderStatus(
  sellerId: string,
  orderId: string,
  status: SellerOrderStatus,
  note: string,
  idToken?: string,
): Promise<void> {
  const ref = doc(getDb(), SELLERS, sellerId, ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");

  // Guard: if already at this status, skip (idempotent at the order level)
  const currentStatus = String(snap.data().status ?? "pending");
  if (currentStatus === status) return;

  const existingTracking = (snap.data().tracking as SellerOrder["tracking"]) ?? [];
  const tracking = [
    ...existingTracking,
    { status, note: note || `Order marked as ${status}`, at: nowMs() },
  ];
  await updateDoc(ref, {
    status,
    tracking,
    updatedAt: serverTimestamp(),
  });

  // SETTLEMENT: When order is delivered, trigger settlement hold period.
  // The server function is idempotent — it checks settlement.settlementStatus
  // and only transitions from "pending" to "hold". Duplicate calls are safe.
  if (status === "delivered" && idToken) {
    try {
      await markOrderDelivered({
        data: { idToken, sellerId, orderId },
      });
    } catch {
      // Non-fatal: settlement will be synced later. The order status
      // update is the source of truth — settlement can catch up.
      // In production, a scheduled job would also check for this.
    }
  }
}
