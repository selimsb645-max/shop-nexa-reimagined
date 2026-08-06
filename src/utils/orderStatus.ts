import type { Order } from "@/types/commerce";

export const ORDER_VIEWS = [
  "pending",
  "processing",
  "packed",
  "shipped",
  "delivery",
  "delivered",
  "returns",
  "refunds",
] as const;

export type OrderView = (typeof ORDER_VIEWS)[number];

export function isOrderView(v: string): v is OrderView {
  return (ORDER_VIEWS as readonly string[]).includes(v);
}

export const VIEW_META: Record<OrderView, { title: string; subtitle: string }> = {
  pending: { title: "Pending Orders", subtitle: "Orders awaiting confirmation" },
  processing: { title: "Processing Orders", subtitle: "We are preparing your items" },
  packed: { title: "Packed Orders", subtitle: "Packed and ready for pickup" },
  shipped: { title: "Shipped Orders", subtitle: "On the way to your city" },
  delivery: { title: "Out for Delivery", subtitle: "Arriving with the courier soon" },
  delivered: { title: "Delivered Orders", subtitle: "Completed orders" },
  returns: { title: "Returns", subtitle: "Cancelled and returned orders" },
  refunds: { title: "Refunds", subtitle: "Orders with refunded payments" },
};

export function isOutForDelivery(o: Order) {
  return o.tracking?.some((t) => /out for delivery/i.test(t.note ?? "")) ?? false;
}

/** Progress steps shown in the live tracker. */
export const PROGRESS_STEPS = [
  "Pending",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
] as const;

/** Index in PROGRESS_STEPS that the order has currently reached. */
export function progressIndex(o: Order): number {
  switch (o.status) {
    case "pending":
      return 0;
    case "processing":
      return 1;
    case "confirmed":
      return 2;
    case "shipped":
      return isOutForDelivery(o) ? 4 : 3;
    case "delivered":
      return 5;
    default:
      return -1;
  }
}

export function filterOrders(orders: Order[], view: OrderView): Order[] {
  switch (view) {
    case "pending":
      return orders.filter((o) => o.status === "pending");
    case "processing":
      return orders.filter((o) => o.status === "processing");
    case "packed":
      return orders.filter((o) => o.status === "confirmed");
    case "shipped":
      return orders.filter((o) => o.status === "shipped" && !isOutForDelivery(o));
    case "delivery":
      return orders.filter((o) => o.status === "shipped" && isOutForDelivery(o));
    case "delivered":
      return orders.filter((o) => o.status === "delivered");
    case "returns":
      return orders.filter((o) => o.status === "cancelled");
    case "refunds":
      return orders.filter((o) => o.payment?.status === "refunded");
  }
}
