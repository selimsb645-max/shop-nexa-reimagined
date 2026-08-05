import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { getDb, getFirebaseAuth } from "./config";
import { placeOrder } from "@/lib/orders.functions";
import type {
  CartItem,
  Order,
  OrderStatus,
  PaymentMethod,
  ShippingAddress,
} from "@/types/commerce";

const SHIPPING_FLAT = 5;
const FREE_SHIPPING_THRESHOLD = 50;

export function computeShipping(subtotalAfterDiscount: number): number {
  return subtotalAfterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
}

export interface CreateOrderInput {
  userId: string;
  buyerEmail?: string | null;
  items: CartItem[];
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentMethod;
  couponCode: string | null;
  discount: number;
}


function nowMs() {
  return Date.now();
}


function mapOrder(id: string, data: Record<string, unknown>): Order {
  const raw = data as Partial<Order> & Record<string, unknown>;
  return {
    id,
    userId: String(raw.userId ?? ""),
    items: (raw.items as Order["items"]) ?? [],
    subtotal: Number(raw.subtotal ?? 0),
    discount: Number(raw.discount ?? 0),
    shipping: Number(raw.shipping ?? 0),
    total: Number(raw.total ?? 0),
    couponCode: (raw.couponCode as string | null) ?? null,
    status: (raw.status as OrderStatus) ?? "pending",
    payment: (raw.payment as Order["payment"]) ?? {
      method: "cash_on_delivery",
      status: "unpaid",
      provider: null,
      transactionId: null,
      paidAt: null,
    },
    shippingAddress: (raw.shippingAddress as ShippingAddress) ?? {
      fullName: "",
      phone: "",
      addressLine: "",
      city: "",
      postalCode: "",
      country: "",
    },
    tracking: (raw.tracking as Order["tracking"]) ?? [],
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : nowMs(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : nowMs(),
  };
}

/**
 * Sends the order to the trusted server endpoint. Prices, discount, shipping,
 * total, stock and coupon usage are all decided server side from Firestore
 * data — the values shown in the cart are only a preview.
 */
export async function createOrder(input: CreateOrderInput): Promise<string> {
  if (!input.items.length) throw new Error("Cart is empty");

  const currentUser = getFirebaseAuth().currentUser;
  if (!currentUser) throw new Error("Please sign in again to place your order.");
  const idToken = await currentUser.getIdToken();

  const result = await placeOrder({
    data: {
      idToken,
      items: input.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
      shippingAddress: {
        fullName: input.shippingAddress.fullName,
        phone: input.shippingAddress.phone,
        addressLine: input.shippingAddress.addressLine,
        city: input.shippingAddress.city,
        postalCode: input.shippingAddress.postalCode,
        country: input.shippingAddress.country,
        ...(input.shippingAddress.notes ? { notes: input.shippingAddress.notes } : {}),
      },
      paymentMethod: input.paymentMethod,
      couponCode: input.couponCode,
    },
  });

  return result.orderId;
}


export async function listOrders(uid: string): Promise<Order[]> {
  const snap = await getDocs(
    query(collection(getDb(), "users", uid, "orders"), orderBy("createdAt", "desc")),
  );
  return snap.docs.map((d) => mapOrder(d.id, d.data()));
}

export async function getOrder(uid: string, orderId: string): Promise<Order | null> {
  const snap = await getDoc(doc(getDb(), "users", uid, "orders", orderId));
  return snap.exists() ? mapOrder(snap.id, snap.data()) : null;
}
