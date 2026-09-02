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
import type { SellerOrder, SellerOrderStatus, ShippingInfo } from "@/types/seller";
import { markOrderDelivered } from "@/lib/settlement.functions";
import {
  isValidSellerOrderStatusTransition,
  transitionErrorMessage,
} from "@/lib/order-transitions";

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
    discount: Number(r.discount ?? 0),
    tax: Number(r.tax ?? 0),
    taxLabel: String(r.taxLabel ?? "Tax"),
    platformFee: Number(r.platformFee ?? 0),
    total: Number(r.total ?? 0),
    commission: Number(r.commission ?? 0),
    earnings: Number(r.earnings ?? 0),
    shipping: (r.shipping as ShippingInfo) ?? {
      courier: null,
      trackingNumber: null,
      shippingCharge: 0,
      status: "pending",
      shippedAt: null,
      deliveredAt: null,
      estimatedDays: null,
      warehouseId: null,
    },
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
    query(collection(getDb(), SELLERS, sellerId, ORDERS), orderBy("createdAt", "desc")),
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
 *
 * SECURITY (Step 22):
 * - isValidSellerOrderStatusTransition() called before any status write
 * - Terminal states (delivered except returned, cancelled, returned) reject
 * - Invalid transitions (e.g. delivered → processing) are rejected
 */
export async function updateSellerOrderStatus(
  sellerId: string,
  orderId: string,
  status: SellerOrderStatus,
  note: string,
  idToken?: string,
  courierInfo?: { name?: string; trackingNumber?: string; trackingUrl?: string },
): Promise<void> {
  const ref = doc(getDb(), SELLERS, sellerId, ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");

  // Guard: if already at this status, skip (idempotent at the order level)
  const currentStatus = String(snap.data().status ?? "pending");
  if (currentStatus === status) return;

  // Step 22: Validate seller order status transition
  if (!isValidSellerOrderStatusTransition(currentStatus, status)) {
    throw new Error(transitionErrorMessage(currentStatus, status, true));
  }

  const existingTracking = (snap.data().tracking as SellerOrder["tracking"]) ?? [];
  const ts = nowMs();

  // Build tracking note
  let trackingNote = note || `Order marked as ${status}`;
  if (status === "shipped" && courierInfo?.name) {
    trackingNote = `Shipped via ${courierInfo.name}${courierInfo.trackingNumber ? ` (Tracking: ${courierInfo.trackingNumber})` : ""}`;
  }

  const tracking = [...existingTracking, { status, note: trackingNote, at: ts }];

  const sellerUpdate: Record<string, unknown> = {
    status,
    tracking,
    updatedAt: serverTimestamp(),
  };

  // Save courier info on seller order when shipping
  if (status === "shipped" && courierInfo) {
    const existingShipping = (snap.data().shipping as Record<string, unknown>) ?? {};
    sellerUpdate.shipping = {
      courier: courierInfo.name ?? null,
      trackingNumber: courierInfo.trackingNumber ?? null,
      shippingCharge: existingShipping.shippingCharge ?? 0,
      status: "shipped",
      shippedAt: ts,
      deliveredAt: null,
      estimatedDays: existingShipping.estimatedDays ?? null,
      warehouseId: existingShipping.warehouseId ?? null,
    };
  }

  await updateDoc(ref, sellerUpdate);

  // SYNC: Update customer's main order so they can see tracking
  const buyerId = String(snap.data().buyerId ?? "");
  if (buyerId) {
    const mainRef = doc(getDb(), "users", buyerId, "orders", orderId);
    const mainSnap = await getDoc(mainRef);
    if (mainSnap.exists()) {
      const mainTracking = ((mainSnap.data().tracking as unknown[]) ?? []).slice();
      mainTracking.push({ status, note: trackingNote, at: ts });

      const mainUpdate: Record<string, unknown> = {
        tracking: mainTracking,
        updatedAt: serverTimestamp(),
      };

      // Map seller status to OrderStatus for main order
      const statusMap: Record<string, string> = {
        confirmed: "confirmed",
        processing: "processing",
        shipped: "shipped",
        delivered: "delivered",
        cancelled: "cancelled",
        returned: "cancelled",
      };
      const mappedStatus = statusMap[status];
      if (mappedStatus && mappedStatus !== mainSnap.data().status) {
        mainUpdate.status = mappedStatus;
      }

      // Add courier info to main order
      if (status === "shipped" && courierInfo) {
        mainUpdate.courierInfo = {
          name: courierInfo.name ?? null,
          trackingNumber: courierInfo.trackingNumber ?? null,
          trackingUrl: courierInfo.trackingUrl ?? null,
          shippedAt: ts,
          estimatedDays: null,
        };
      }

      await updateDoc(mainRef, mainUpdate);
    }
  }

  // SETTLEMENT: When order is delivered, trigger settlement hold period.
  if (status === "delivered" && idToken) {
    try {
      await markOrderDelivered({
        data: { idToken, sellerId, orderId },
      });
    } catch {
      // Non-fatal: settlement will be synced later.
    }
  }
}
