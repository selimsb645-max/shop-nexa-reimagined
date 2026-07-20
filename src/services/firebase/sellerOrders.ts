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

export async function updateSellerOrderStatus(
  sellerId: string,
  orderId: string,
  status: SellerOrderStatus,
  note: string,
): Promise<void> {
  const ref = doc(getDb(), SELLERS, sellerId, ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");
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
}
