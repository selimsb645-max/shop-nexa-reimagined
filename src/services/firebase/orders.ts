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

import type { DeliveryAddressSnapshot } from "@/types/address";
import { detectDeliveryZone, getDeliveryCharge, type DeliveryLocationInput } from "@/data/bd-locations/deliveryZones";

/**
 * Compute delivery charge based on the customer's delivery address zone.
 * This is a CLIENT-SIDE preview only — the authoritative calculation
 * happens server-side in checkout.server.ts.
 *
 * Returns ৳60 / ৳100 / ৳170 based on zone, or 0 if no address selected yet.
 */
export function computeDeliveryChargePreview(
  location: DeliveryLocationInput | null | undefined,
): number {
  if (!location || !location.districtEn) return 0;
  return getDeliveryCharge(location);
}

/**
 * Detect the delivery zone from a DeliveryAddressSnapshot.
 */
export function detectZoneFromSnapshot(
  snapshot: DeliveryAddressSnapshot | null | undefined,
) {
  if (!snapshot) return null;
  return detectDeliveryZone({
    divisionEn: snapshot.divisionEn,
    districtEn: snapshot.districtEn,
    upazilaEn: snapshot.upazilaEn,
    thanaEn: snapshot.thanaEn,
    postOfficeEn: snapshot.postOfficeEn,
    postalCode: snapshot.postalCode,
  });
}

// Legacy function kept for backward compat — now returns 0 (unused)
export function computeShipping(_subtotalAfterDiscount: number): number {
  return 0;
}

export interface CreateOrderInput {
  userId: string;
  buyerEmail?: string | null;
  items: CartItem[];
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentMethod;
  couponCode: string | null;
  promoCode: string | null;
  discount: number;
  rewardPoints?: number;
  walletUsed?: number;
  deliveryAddressSnapshot?: DeliveryAddressSnapshot | null;
  verificationSessionId: string;
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
    tax: Number(raw.tax ?? 0),
    taxRate: Number(raw.taxRate ?? 0),
    taxLabel: String(raw.taxLabel ?? ""),
    promoDiscount: Number(raw.promoDiscount ?? 0),
    rewardDiscount: Number(raw.rewardDiscount ?? 0),
    walletUsed: Number(raw.walletUsed ?? 0),
    total: Number(raw.total ?? 0),
    platformFee: Number(raw.platformFee ?? 0),
    couponCode: (raw.couponCode as string | null) ?? null,
    promoCode: (raw.promoCode as string | null) ?? null,
    status: (raw.status as OrderStatus) ?? "pending",
    payment: (raw.payment as Order["payment"]) ?? {
      method: "cash_on_delivery",
      status: "unpaid",
      provider: null,
      transactionId: null,
      paidAt: null,
    },
    deliveryAddressSnapshot: (raw.deliveryAddressSnapshot as DeliveryAddressSnapshot | null) ?? null,
    deliveryZone: (raw.deliveryZone as string | null) ?? null,
    deliveryZoneLabel: (raw.deliveryZoneLabel as string | null) ?? null,
    deliveryCharge: (raw.deliveryCharge as number | null) ?? null,
    courierInfo: (raw.courierInfo as Order["courierInfo"]) ?? null,
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
      verificationSessionId: input.verificationSessionId,
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
      promoCode: input.promoCode,
      rewardPoints: input.rewardPoints ?? 0,
      walletUsed: input.walletUsed ?? 0,
      ...(input.deliveryAddressSnapshot ? { deliveryAddressSnapshot: input.deliveryAddressSnapshot } : {}),
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
