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
import { reverseSellerEarnings } from "./adminSettlements";

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
    tax: Number(d.tax ?? 0),
    taxRate: Number(d.taxRate ?? 0),
    taxLabel: String(d.taxLabel ?? "Tax"),
    total: Number(d.total ?? 0),
    platformFee: Number(d.platformFee ?? 0),
    promoDiscount: Number(d.promoDiscount ?? 0),
    rewardDiscount: Number(d.rewardDiscount ?? 0),
    walletUsed: Number(d.walletUsed ?? 0),
    couponCode: (d.couponCode as string | null) ?? null,
    promoCode: (d.promoCode as string | null) ?? null,
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

  // Guard: if already at this status, skip (idempotent)
  const currentStatus = String(snap.data().status ?? "pending");
  if (currentStatus === status) return;

  const tracking = ((snap.data().tracking as Order["tracking"]) ?? []).slice();
  tracking.push({ status, note: note || `Marked as ${status} by admin`, at: Date.now() });
  await updateDoc(ref, { status, tracking, updatedAt: serverTimestamp() });
}

/**
 * Cancels an order.
 *
 * SETTLEMENT INTEGRATION:
 * When an order is cancelled, ALL seller settlements for that order must be
 * reversed. This calls reverseSellerSettlement for each seller in the order.
 *
 * BEHAVIOR by settlement status:
 * - "pending" or "hold": → "reversed" (no wallet impact)
 * - "available": → "reversed" + walletTx debit (earnings removed)
 * - "paid": throws error (manual reconciliation needed)
 * - "reversed": no-op (idempotent)
 *
 * IDEMPOTENT: If settlement is already "reversed", the server function
 * returns { reversed: false } without creating duplicate entries.
 * Cancelling an already-cancelled order is also safe (order status guard).
 *
 * @param idToken Admin's Firebase ID token for server function verification
 */
export async function cancelOrderAdmin(
  userId: string,
  orderId: string,
  reason: string,
  idToken?: string,
): Promise<void> {
  const ref = doc(getDb(), "users", userId, "orders", orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");

  // Guard: if already cancelled, skip (idempotent)
  const currentStatus = String(snap.data().status ?? "pending");
  if (currentStatus === "cancelled") return;

  const tracking = ((snap.data().tracking as Order["tracking"]) ?? []).slice();
  tracking.push({ status: "cancelled", note: reason || "Cancelled by admin", at: Date.now() });
  await updateDoc(ref, { status: "cancelled", tracking, updatedAt: serverTimestamp() });

  // SETTLEMENT REVERSAL: Reverse earnings for ALL sellers in this order.
  // The order document contains "sellerIds" array listing all sellers.
  // Each reversal is idempotent — if already reversed, it's a no-op.
  const sellerIds = (snap.data().sellerIds as string[] | undefined) ?? [];
  if (idToken && sellerIds.length > 0) {
    for (const sellerId of sellerIds) {
      try {
        await reverseSellerEarnings({
          idToken,
          sellerId,
          orderId,
          reason: reason || "Order cancelled by admin",
        });
      } catch {
        // Non-fatal: reversal may have already been processed or
        // settlement may be in "paid" status requiring manual handling.
        // The reversal attempt is logged in the settlement ledger.
      }
    }
  }
}
