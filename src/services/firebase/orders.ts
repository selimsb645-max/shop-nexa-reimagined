import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { getDb } from "./config";
import { bumpCouponUses } from "./coupons";
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

export async function createOrder(input: CreateOrderInput): Promise<string> {
  const db = getDb();
  if (!input.items.length) throw new Error("Cart is empty");

  const orderId = doc(collection(db, "users", input.userId, "orders")).id;
  const orderRef = doc(db, "users", input.userId, "orders", orderId);

  const orderItems = input.items.map((i) => ({
    productId: i.productId,
    slug: i.slug,
    title: i.title,
    image: i.image,
    price: i.price,
    quantity: i.quantity,
    subtotal: Math.round(i.price * i.quantity * 100) / 100,
  }));
  const subtotal = orderItems.reduce((s, it) => s + it.subtotal, 0);
  const discount = Math.min(subtotal, input.discount);
  const subAfterDiscount = subtotal - discount;
  const shipping = computeShipping(subAfterDiscount);
  const total = Math.round((subAfterDiscount + shipping) * 100) / 100;

  let productDatas: Array<Record<string, unknown>> = [];

  await runTransaction(db, async (tx) => {
    // Reads first: validate stock and pull product refs.
    const productRefs = input.items.map((i) => doc(db, "products", i.productId));
    const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));
    productSnaps.forEach((snap, idx) => {
      if (!snap.exists()) throw new Error(`${input.items[idx].title} is no longer available`);
      const stock = Number((snap.data() as { stock?: number }).stock ?? 0);
      if (stock < input.items[idx].quantity)
        throw new Error(`Not enough stock for ${input.items[idx].title}`);
    });
    productDatas = productSnaps.map((s) => (s.data() ?? {}) as Record<string, unknown>);

    // Group items by seller for mirror docs.
    const itemsBySeller = new Map<string, typeof orderItems>();
    orderItems.forEach((item, idx) => {
      const sid = (productDatas[idx].sellerId as string | undefined) ?? "";
      if (!sid) return;
      const list = itemsBySeller.get(sid) ?? [];
      list.push({ ...item });
      itemsBySeller.set(sid, list);
    });
    const sellerIds = Array.from(itemsBySeller.keys());

    // Writes: order + decrement stock + clear cart items + seller mirrors.
    tx.set(orderRef, {
      userId: input.userId,
      items: orderItems,
      sellerIds,
      subtotal,
      discount,
      shipping,
      total,
      couponCode: input.couponCode,
      status: "pending" as OrderStatus,
      payment: {
        method: input.paymentMethod,
        status: input.paymentMethod === "cash_on_delivery" ? "pending" : "unpaid",
        provider: null,
        transactionId: null,
        paidAt: null,
      },
      shippingAddress: input.shippingAddress,
      tracking: [
        {
          status: "pending",
          note: "Order placed successfully",
          at: nowMs(),
        },
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    productSnaps.forEach((snap, idx) => {
      tx.update(productRefs[idx], {
        stock: Number((snap.data() as { stock?: number }).stock ?? 0) - input.items[idx].quantity,
        updatedAt: serverTimestamp(),
      });
    });

    for (const item of input.items) {
      tx.delete(doc(db, "users", input.userId, "cart", item.productId));
    }

    for (const [sid, sItems] of itemsBySeller.entries()) {
      const sellerSubtotal =
        Math.round(sItems.reduce((s, it) => s + it.subtotal, 0) * 100) / 100;
      const sellerOrderRef = doc(db, "sellers", sid, "orders", orderId);
      tx.set(sellerOrderRef, {
        sellerId: sid,
        buyerId: input.userId,
        buyerName: input.shippingAddress.fullName,
        buyerEmail: input.buyerEmail ?? null,
        items: sItems,
        subtotal: sellerSubtotal,
        status: "pending",
        shippingAddress: input.shippingAddress,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentMethod === "cash_on_delivery" ? "pending" : "unpaid",
        tracking: [
          { status: "pending", note: "New order received", at: nowMs() },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const notifRef = doc(collection(db, "sellers", sid, "notifications"));
      tx.set(notifRef, {
        type: "order",
        title: "New order received",
        message: `Order #${orderId.slice(0, 8)} · ${sItems.length} item${sItems.length > 1 ? "s" : ""}`,
        link: `/seller/orders/${orderId}`,
        read: false,
        createdAt: serverTimestamp(),
      });
    }
  });


  if (input.couponCode) {
    try {
      await bumpCouponUses(input.couponCode);
    } catch {
      // Non-fatal — order was already placed.
    }
  }

  return orderId;
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
