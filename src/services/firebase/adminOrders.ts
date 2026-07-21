import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Order, OrderStatus, ShippingAddress } from "@/types/commerce";

export interface AdminOrderRow extends Order {
  path: string; // e.g. users/<uid>/orders/<id>
}

function mapOrder(id: string, d: Record<string, unknown>): Order {
  const nowMs = Date.now();
  const created = d.createdAt as { toMillis?: () => number } | number | undefined;
  return {
    id,
    userId: String(d.userId ?? ""),
    items: (d.items as Order["items"]) ?? [],
    subtotal: Number(d.subtotal ?? 0),
    discount: Number(d.discount ?? 0),
    shipping: Number(d.shipping ?? 0),
    total: Number(d.total ?? 0),
    couponCode: (d.couponCode as string | null) ?? null,
    status: (d.status as OrderStatus) ?? "pending",
    payment: (d.payment as Order["payment"]) ?? {
      method: "cash_on_delivery",
      status: "unpaid",
      provider: null,
      transactionId: null,
      paidAt: null,
    },
    shippingAddress: (d.shippingAddress as ShippingAddress) ?? {
      fullName: "",
      phone: "",
      addressLine: "",
      city: "",
      postalCode: "",
      country: "",
    },
    tracking: (d.tracking as Order["tracking"]) ?? [],
    createdAt:
      typeof created === "number" ? created : created?.toMillis?.() ?? nowMs,
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : nowMs,
  };
}

/**
 * Lists all buyer orders (users/{uid}/orders subcollections) via a collectionGroup query.
 * Filters out seller mirror docs (sellers/{sid}/orders) by inspecting the parent path.
 */
export async function listAllOrders(): Promise<AdminOrderRow[]> {
  const snap = await getDocs(
    query(collectionGroup(getDb(), "orders"), orderBy("createdAt", "desc")),
  );
  return snap.docs
    .filter((d) => d.ref.parent.parent?.parent.id === "users")
    .map((d) => ({ ...mapOrder(d.id, d.data()), path: d.ref.path }));
}

export async function getAdminOrder(userId: string, orderId: string): Promise<Order | null> {
  const snap = await getDoc(doc(getDb(), "users", userId, "orders", orderId));
  return snap.exists() ? mapOrder(snap.id, snap.data()) : null;
}

export async function updateOrderStatusAdmin(
  userId: string,
  orderId: string,
  status: OrderStatus,
  note: string,
): Promise<void> {
  const ref = doc(getDb(), "users", userId, "orders", orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");
  const tracking = ((snap.data().tracking as Order["tracking"]) ?? []).slice();
  tracking.push({ status, note: note || `Marked as ${status} by admin`, at: Date.now() });
  await updateDoc(ref, { status, tracking, updatedAt: serverTimestamp() });
}

export async function cancelOrderAdmin(
  userId: string,
  orderId: string,
  reason: string,
): Promise<void> {
  await updateOrderStatusAdmin(userId, orderId, "cancelled", reason || "Cancelled by admin");
}
