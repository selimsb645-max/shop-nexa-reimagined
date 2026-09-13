// ═══════════════════════════════════════════════════════════════
// Aventa Mart — Order Workflow Processor (Prompt 03 §7)
// ═══════════════════════════════════════════════════════════════
// Event-driven fan-out for every major state transition:
//
//   Order Event → Workflow Processor
//   ├── Inventory      (reservation / release / sold)
//   ├── Notification   (seller, admin, customer — FCM-ready)
//   ├── Seller         (per-seller order notifications)
//   ├── Customer       (order confirmations)
//   ├── Shipment       (logistics provider adapter)
//   ├── Finance        (finance-relevant transition ledger)
//   └── Audit          (activityLogs)
//
// GUARANTEES:
//  • IDEMPOTENT — deterministic doc ids everywhere: a duplicated
//    event NEVER creates duplicate notifications, shipments,
//    reservations, or audit rows (§7 idempotency key requirement).
//  • ISOLATED — one handler failing never corrupts the order or
//    blocks the other branches; failures are recorded per-handler.
//  • AUDITABLE — every event doc records which handlers ran.
// ═══════════════════════════════════════════════════════════════

import {
  commitWrites,
  docPath,
  toFsFields,
  type FsWrite,
  batchGetDocs,
} from "./firebase-admin.server";
import {
  convertReservationToSold,
  releaseInventoryForOrder,
  reserveInventoryForOrder,
  type ReservationItem,
} from "./inventory.server";
import {
  AventaLogisticsProvider,
  shipmentDocId,
  SHIPMENTS_COLLECTION,
} from "./logistics/aventaLogistics.server";
import { LogisticsError } from "./logistics/types";
import {
  EVENT_HANDLER_MAP,
  ORDER_STATUS_LABELS,
  normalizeOrderStatus,
  type OrderEventType,
  type OrderWorkflowHandler,
} from "./orderStateMachine";

export const ORDER_EVENTS_COLLECTION = "orderEvents";
export const ADMIN_NOTIFICATIONS_COLLECTION = "adminNotifications";
export const FINANCE_EVENTS_COLLECTION = "financeEvents";

/**
 * Context every handler may need about the order.
 *
 * `actor` is OPTIONAL and additive (admin fan-out bridge, Sep 2026):
 * when a transition is initiated by a human (admin console / admin
 * panel), the audit handler records WHO approved it instead of the
 * default "system" actor. Omitted everywhere else — checkout and
 * all existing callers keep their exact previous behavior.
 */
export interface OrderEventContext {
  orderId: string;
  customerId: string;
  sellerIds: string[];
  /** Product lines for inventory reservation (productId → qty). */
  items: ReservationItem[];
  /**
   * Flash-sale claims reserved at checkout (reserve→order). Released
   * by the flash-sale handler on CANCELLED / DELIVERY_FAILED.
   * Absent on every order without a flash-sale line.
   */
  flashSaleClaims?: Array<{ campaignId: string; productId: string; quantity: number }>;
  total: number;
  currency?: string;
  note?: string;
  actor?: { uid: string; email?: string | null } | null;
}

export interface DispatchResult {
  eventId: string;
  ok: boolean;
  handlersRun: string[];
  handlersFailed: Record<string, string>;
  skipped?: string;
}

/** Deterministic event doc id — THE idempotency key (§7). */
export function orderEventDocId(orderId: string, type: OrderEventType): string {
  return `${orderId}__${type}`;
}

type Handler = (projectId: string, event: OrderEventContext, type: OrderEventType) => Promise<void>;

// ───────────────────────────────────────────────────────────────
// Handlers
// ───────────────────────────────────────────────────────────────

const inventoryHandler: Handler = async (projectId, event, type) => {
  if (type === "ORDER_CREATED" || type === "PAYMENT_CONFIRMED") {
    const result = await reserveInventoryForOrder(projectId, event.orderId, event.items);
    if (!result.ok && result.state !== "reserved") {
      throw new Error(result.reason ?? "Inventory reservation failed.");
    }
    return;
  }
  if (type === "CANCELLED" || type === "DELIVERY_FAILED") {
    const result = await releaseInventoryForOrder(projectId, event.orderId);
    if (!result.ok) throw new Error(result.reason ?? "Inventory release failed.");
    return;
  }
  if (type === "DELIVERED") {
    const result = await convertReservationToSold(projectId, event.orderId);
    if (!result.ok) throw new Error(result.reason ?? "Inventory conversion failed.");
    return;
  }
  // No inventory action for this event type — no-op success.
};

/**
 * Reserve→order flash-sale compensation: when an order dies after
 * checkout (cancelled by the customer, admin, or a failed delivery),
 * the flash-sale stock pool and the per-customer purchase counter
 * must give the units back. DELIVERED keeps the reservation — the
 * purchase counter was already written at checkout reserve time.
 */
const flashSaleHandler: Handler = async (projectId, event, type) => {
  if (type !== "CANCELLED" && type !== "DELIVERY_FAILED") return;
  const claims = event.flashSaleClaims ?? [];
  if (claims.length === 0) return;
  const { releaseFlashSaleStock } = await import("./campaigns/flashSale.server");
  await Promise.all(
    claims.map((c) => releaseFlashSaleStock(projectId, c.campaignId, event.customerId, c.quantity)),
  );
};

const notifySellerHandler: Handler = async (projectId, event, type) => {
  const now = Date.now();
  const title =
    type === "SELLER_NOTIFIED"
      ? "New order received"
      : `Order ${ORDER_STATUS_LABELS[normalizeOrderStatus(type)]}`;
  const writes: FsWrite[] = event.sellerIds.map((sid) => ({
    update: {
      // Deterministic id → duplicate events never double-notify (§7).
      name: docPath(projectId, [
        "sellers",
        sid,
        "notifications",
        `n_${event.orderId}_${type.toLowerCase()}`,
      ]),
      fields: toFsFields({
        type: "order",
        title,
        message: `Order #${event.orderId.slice(0, 8)} · ${event.items.length} item${
          event.items.length > 1 ? "s" : ""
        }`,
        link: `/seller/orders/${event.orderId}`,
        read: false,
        createdAt: now,
        eventOrderId: event.orderId,
        eventType: type,
      }),
    },
  }));
  if (writes.length) await commitWrites(projectId, writes);
};

const notifyAdminHandler: Handler = async (projectId, event, type) => {
  const now = Date.now();
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [
          ADMIN_NOTIFICATIONS_COLLECTION,
          `a_${event.orderId}_${type.toLowerCase()}`,
        ]),
        fields: toFsFields({
          type: "order",
          title: `Order ${ORDER_STATUS_LABELS[normalizeOrderStatus(type)]}`,
          message: `Order #${event.orderId.slice(0, 8)} — ${ORDER_STATUS_LABELS[normalizeOrderStatus(type)]}`,
          orderId: event.orderId,
          eventType: type,
          sellerIds: event.sellerIds,
          total: event.total,
          read: false,
          createdAt: now,
        }),
      },
    },
  ]);
};

const notifyCustomerHandler: Handler = async (projectId, event, type) => {
  const now = Date.now();
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [
          "users",
          event.customerId,
          "notifications",
          `n_${event.orderId}_${type.toLowerCase()}`,
        ]),
        fields: toFsFields({
          type: "order",
          title: `Order ${ORDER_STATUS_LABELS[normalizeOrderStatus(type)]}`,
          message: `Your order #${event.orderId.slice(0, 8)} is now ${ORDER_STATUS_LABELS[normalizeOrderStatus(type)].toLowerCase()}.`,
          link: `/orders/${event.orderId}`,
          read: false,
          createdAt: now,
          eventOrderId: event.orderId,
          eventType: type,
        }),
      },
    },
  ]);
};

const shipmentHandler: Handler = async (projectId, event, type) => {
  const provider = new AventaLogisticsProvider(projectId);
  const shipmentName = docPath(projectId, [SHIPMENTS_COLLECTION, shipmentDocId(event.orderId)]);

  if (type === "READY_TO_SHIP") {
    // Create one shipment for the FIRST seller of the order (multi-
    // seller orders get per-seller sellerOrders; the customer-level
    // shipment tracks the primary fulfillment).
    const sellerId = event.sellerIds[0];
    if (!sellerId) return; // no seller → nothing to ship
    const shipment = await provider.createShipment({
      orderId: event.orderId,
      sellerId,
      customerId: event.customerId,
    });
    await provider.generateLabel(shipment);
    return;
  }

  // All other shipment actions need the existing shipment doc.
  const { batchGetDocs } = await import("./firebase-admin.server");
  const docs = await batchGetDocs(projectId, [shipmentName]);
  const raw = docs.get(shipmentName);
  if (!raw?.exists) {
    // No shipment for this order (legacy/exception path) — not an error.
    return;
  }
  const fields = (raw.data ?? {}) as Record<string, unknown>;
  const shipment = {
    shipmentId: String(fields["shipmentId"] ?? ""),
    orderId: event.orderId,
    sellerId: String(fields["sellerId"] ?? ""),
    customerId: String(fields["customerId"] ?? ""),
    trackingNumber: String(fields["trackingNumber"] ?? ""),
    barcode: String(fields["barcode"] ?? ""),
    shippingStatus: String(fields["shippingStatus"] ?? "CREATED") as never,
    carrier: String(fields["carrier"] ?? "Aventa Logistics"),
    provider: String(fields["provider"] ?? "aventa-logistics"),
    createdAt: Number(fields["createdAt"] ?? 0),
    updatedAt: Number(fields["updatedAt"] ?? 0),
  };

  const now = Date.now();
  switch (type) {
    case "HANDED_OVER":
      await provider.handoverShipment(shipment);
      await provider.trackShipment(shipment, {
        type: "HANDED_OVER",
        note: "Handed over to carrier",
        at: now,
        by: "system",
      });
      break;
    case "IN_TRANSIT":
      await provider.trackShipment(shipment, {
        type: "IN_TRANSIT",
        note: "Shipment in transit",
        at: now,
        by: "system",
      });
      break;
    case "OUT_FOR_DELIVERY":
      await provider.trackShipment(shipment, {
        type: "OUT_FOR_DELIVERY",
        note: "Out for delivery",
        at: now,
        by: "system",
      });
      break;
    case "DELIVERED":
      await provider.trackShipment(shipment, {
        type: "DELIVERED",
        note: "Delivered",
        at: now,
        by: "system",
      });
      break;
    case "DELIVERY_FAILED":
      await provider.trackShipment(shipment, {
        type: "FAILED",
        note: "Delivery attempt failed",
        at: now,
        by: "system",
      });
      break;
    case "CANCELLED":
      try {
        await provider.cancelShipment(shipment);
      } catch (err) {
        if (err instanceof LogisticsError && err.code === "SHIPMENT_NOT_CANCELLABLE") {
          return; // already picked up — return flow takes over
        }
        throw err;
      }
      break;
    default:
      break;
  }
};

const financeHandler: Handler = async (projectId, event, type) => {
  const financeRelevant: OrderEventType[] = [
    "DELIVERED",
    "CANCELLED",
    "RETURNED",
    "REFUND_PENDING",
    "REFUNDED",
  ];

  // ── PROMPT 04 §1: LEDGER-FIRST FINANCE v2 ──────────────────────
  // Rides on the order events (idempotent, integer paisa). Failures
  // are recorded in a repair queue — money movements are never
  // silently lost and never block the order pipeline (§7).
  if (financeRelevant.includes(type) || type === "ORDER_CREATED") {
    try {
      const { readFinanceConfig, createSettlementsForOrder, advanceSettlementsForOrderEvent } =
        await import("./finance/settlements.server");
      const { computeOrderFinancials } = await import("./finance/fees.server");
      const config = await readFinanceConfig(projectId);

      if (type === "ORDER_CREATED") {
        // Build per-seller lines from the enriched event context.
        const lines = (event.items ?? []).filter(
          (i) => i.sellerId != null && i.lineTotalTaka != null,
        );
        if (lines.length > 0) {
          const settingsName = docPath(projectId, ["settings", "site"]);
          const settingsDocs = await batchGetDocs(projectId, [settingsName]);
          const siteSettingsData = (settingsDocs.get(settingsName)?.data ?? {}) as Record<
            string,
            unknown
          >;
          const breakdown = await computeOrderFinancials(
            projectId,
            siteSettingsData,
            lines.map((i) => ({
              sellerId: i.sellerId!,
              categoryId: i.categoryId ?? null,
              subcategoryId: i.subcategoryId ?? null,
              lineTotalTaka: i.lineTotalTaka!,
              shippingTaka: i.shippingTaka ?? 0,
            })),
          );
          await createSettlementsForOrder(projectId, event.orderId, breakdown.lines, config);
        }
      } else if (
        type === "DELIVERED" ||
        type === "RETURNED" ||
        type === "REFUND_PENDING" ||
        type === "REFUNDED" ||
        type === "CANCELLED"
      ) {
        await advanceSettlementsForOrderEvent(
          projectId,
          event.orderId,
          type as "DELIVERED",
          config,
        );
      }
    } catch (err) {
      // Repairable trail — the finance admin console can re-run this
      // step idempotently (all writes use deterministic keys).
      await commitWrites(projectId, [
        {
          update: {
            name: docPath(projectId, [
              "financeRepairQueue",
              `rep_${event.orderId}_${type.toLowerCase()}`,
            ]),
            fields: toFsFields({
              orderId: event.orderId,
              eventType: type,
              error: err instanceof Error ? err.message : String(err),
              createdAt: Date.now(),
              resolvedAt: null,
            }),
          },
        },
      ]).catch(() => {});
    }
  }

  // ── LEGACY AUDIT TRAIL (unchanged behavior) ─────────────────────
  if (!financeRelevant.includes(type)) return;
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [
          FINANCE_EVENTS_COLLECTION,
          `f_${event.orderId}_${type.toLowerCase()}`,
        ]),
        fields: toFsFields({
          orderId: event.orderId,
          eventType: type,
          total: event.total,
          currency: event.currency ?? "BDT",
          sellerIds: event.sellerIds,
          at: Date.now(),
        }),
      },
    },
  ]);
};

const auditHandler: Handler = async (projectId, event, type) => {
  // Admin-initiated transitions record the approving human (additive;
  // every system-initiated event keeps writing actorUid "system").
  const actor = event.actor ?? null;
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, ["activityLogs", `act_${event.orderId}_${type.toLowerCase()}`]),
        fields: toFsFields({
          actorUid: actor?.uid ?? "system",
          actorEmail: actor?.email ?? null,
          action: `order.${type.toLowerCase()}`,
          target: event.orderId,
          details:
            `Order ${ORDER_STATUS_LABELS[normalizeOrderStatus(type)]}` +
            (actor ? ` — by ${actor.email ?? actor.uid} (admin)` : ""),
          createdAt: Date.now(),
        }),
      },
    },
  ]);
};

const HANDLERS: Record<OrderWorkflowHandler, Handler> = {
  inventory: inventoryHandler,
  flashSale: flashSaleHandler,
  notifySeller: notifySellerHandler,
  notifyAdmin: notifyAdminHandler,
  notifyCustomer: notifyCustomerHandler,
  shipment: shipmentHandler,
  finance: financeHandler,
  audit: auditHandler,
};

// ───────────────────────────────────────────────────────────────
// Dispatcher
// ───────────────────────────────────────────────────────────────

/**
 * Emit an order event and run its workflow fan-out.
 * IDEMPOTENT: the event doc id is deterministic (`orderId__type`);
 * a repeated dispatch for the same transition is recorded and
 * skipped — no handler runs twice.
 */
export async function dispatchOrderEvent(
  projectId: string,
  orderId: string,
  type: OrderEventType,
  context: Omit<OrderEventContext, "orderId">,
): Promise<DispatchResult> {
  const event: OrderEventContext = { ...context, orderId };
  const eventId = orderEventDocId(orderId, type);
  const eventName = docPath(projectId, [ORDER_EVENTS_COLLECTION, eventId]);

  // Mark the event doc first (deterministic id = idempotency key).
  // If this exact event was already processed, skip everything.
  const { batchGetDocs } = await import("./firebase-admin.server");
  const existing = (await batchGetDocs(projectId, [eventName])).get(eventName);
  if (existing?.exists) {
    return {
      eventId,
      ok: true,
      handlersRun: [],
      handlersFailed: {},
      skipped: "already-processed",
    };
  }

  const now = Date.now();
  await commitWrites(projectId, [
    {
      update: {
        name: eventName,
        fields: toFsFields({
          orderId,
          type,
          payload: JSON.stringify({
            customerId: event.customerId,
            sellerIds: event.sellerIds,
            total: event.total,
            items: event.items,
            note: event.note ?? null,
            actor: event.actor ?? null,
          }),
          state: "processing",
          createdAt: now,
          processedAt: null,
        }),
      },
    },
  ]);

  // Fan out. One branch failing must not corrupt the order or
  // block the others (§7): run all, collect failures per handler.
  const handlersRun: string[] = [];
  const handlersFailed: Record<string, string> = {};
  for (const name of EVENT_HANDLER_MAP[type]) {
    try {
      await HANDLERS[name](projectId, event, type);
      handlersRun.push(name);
    } catch (err) {
      handlersFailed[name] = err instanceof Error ? err.message : String(err);
    }
  }

  // Record the outcome on the event doc.
  await commitWrites(projectId, [
    {
      update: {
        name: eventName,
        fields: toFsFields({
          state: Object.keys(handlersFailed).length ? "partial" : "processed",
          handlersRun,
          handlersFailed,
          processedAt: Date.now(),
        }),
      },
      updateMask: {
        fieldPaths: ["state", "handlersRun", "handlersFailed", "processedAt"],
      },
    },
  ]);

  return { eventId, ok: Object.keys(handlersFailed).length === 0, handlersRun, handlersFailed };
}

// ───────────────────────────────────────────────────────────────
// Status advancement (validated, legacy-compatible)
// ───────────────────────────────────────────────────────────────

/**
 * Advance an order to the next canonical status.
 *  • Validates the transition against the state machine (defense-in-
 *    depth alongside Firestore rules).
 *  • Appends to the legacy `tracking` array using the legacy status
 *    vocabulary so every existing UI keeps rendering correctly.
 *  • No-op when the order is already at the target status (idempotent
 *    event replay never double-advances).
 */
export async function advanceOrderStatus(
  projectId: string,
  customerId: string,
  orderId: string,
  to: OrderEventType,
  note: string,
): Promise<{ advanced: boolean; from: string }> {
  const { batchGetDocs } = await import("./firebase-admin.server");
  const { isValidCanonicalTransition, normalizeOrderStatus, toLegacyStatus } =
    await import("./orderStateMachine");

  // Customer orders live at users/{uid}/orders/{orderId}
  // (see checkout.server.ts and firestore.rules /users/{uid}/orders).
  const orderName = docPath(projectId, ["users", customerId, "orders", orderId]);
  const docs = await batchGetDocs(projectId, [orderName]);
  const orderDoc = docs.get(orderName);
  if (!orderDoc?.exists) {
    throw new Error(`Order ${orderId} not found — cannot advance status.`);
  }
  const data = (orderDoc.data ?? {}) as Record<string, unknown>;
  const current = String(data["status"] ?? "ORDER_CREATED");

  // Idempotent: already at target (canonical or legacy equivalent).
  if (normalizeOrderStatus(current) === normalizeOrderStatus(to)) {
    return { advanced: false, from: current };
  }

  // Validate against the machine — invalid transition never written.
  if (!isValidCanonicalTransition(current, to)) {
    throw new Error(
      `Invalid transition ${normalizeOrderStatus(current)} → ${to} for order ${orderId}.`,
    );
  }

  // Merge the legacy tracking array (append the new milestone).
  const existingTracking = Array.isArray(data["tracking"]) ? (data["tracking"] as unknown[]) : [];
  const trackingEntry = {
    status: toLegacyStatus(normalizeOrderStatus(to)),
    note,
    at: Date.now(),
  };

  await commitWrites(projectId, [
    {
      update: {
        name: orderName,
        fields: toFsFields({
          status: to, // canonical machine value
          tracking: [...existingTracking, trackingEntry],
          updatedAt: Date.now(),
        }),
      },
      // CRITICAL FIX (Sep 6, PART 1): without updateMask the Firestore
      // REST commit REPLACES the entire document — status advancement
      // would wipe the order's financial fields (items, total, payment,
      // address, sellerIds). The mask restricts the write to exactly
      // the three operational fields. Caught by emulator verification.
      // (updateMask is a sibling of `update` in the Firestore Write
      // message — NOT inside it.)
      updateMask: { fieldPaths: ["status", "tracking", "updatedAt"] },
    },
  ]);

  return { advanced: true, from: current };
}
