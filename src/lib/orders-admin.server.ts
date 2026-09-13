// ═══════════════════════════════════════════════════════════════
// Aventa Mart — Admin Order Transition Service (PART 1)
// ═══════════════════════════════════════════════════════════════
// Canonical entry point for ADMIN-initiated order transitions.
//
//   admin action → authorization → machine validation →
//   advanceOrderStatus (engine) → dispatchOrderEvent (engine
//   fan-out: inventory/notifications/shipment/finance/audit)
//
// This reuses the SAME engine the checkout workflow uses — no
// duplicated business logic, no second state machine. The admin
// panel's bridge (aventa-admin-panel) mirrors these exact
// semantics; both paths write identical deterministic doc ids
// (`{orderId}__{TYPE}` events, `n_/a_/act_` fan-out docs), so an
// event dispatched through either path NEVER double-processes.
//
// GUARANTEES (PART 1 requirements):
//  • AUTHORIZATION — server-side: the caller's users/{uid} doc
//    must hold an order-operations role (super_admin / admin /
//    order_manager, not blocked). Frontend checks are UX only.
//  • MACHINE — the 17-status canonical machine is unchanged and
//    re-validated here (defense-in-depth alongside rules).
//  • IDEMPOTENT — advanceOrderStatus no-ops on same-status
//    replay; dispatchOrderEvent skips already-processed events
//    (deterministic id). Retries never duplicate notifications.
//  • FINANCIAL LOCK — only status/tracking/updatedAt are ever
//    written; financial fields are untouchable.
// ═══════════════════════════════════════════════════════════════

import { commitWrites, docPath, batchGetDocs, toFsFields } from "./firebase-admin.server";
import { advanceOrderStatus, dispatchOrderEvent } from "./orderWorkflow.server";
import { CANONICAL_TRANSITIONS, type CanonicalOrderStatus } from "./orderStateMachine";

/** Order-operations roles (mirrors roleIn([...]) in firestore.rules). */
export const ORDER_ADMIN_ROLES = ["super_admin", "admin", "order_manager"] as const;

export interface AdminAdvanceOrderParams {
  /** Verified caller (from verifyIdToken — never trust a client claim). */
  callerUid: string;
  callerEmail?: string | null;
  /** Order owner (users/{customerId}/orders/{orderId}). */
  customerId: string;
  orderId: string;
  /** Target canonical status (17-status machine). */
  to: CanonicalOrderStatus;
  note: string;
}

export interface AdminAdvanceOrderResult {
  advanced: boolean;
  from: string;
  to: CanonicalOrderStatus;
  /** Canonical event id — deterministic `{orderId}__{TYPE}`. */
  eventId: string;
  handlersRun: string[];
  handlersFailed: Record<string, string>;
  /** Present when nothing happened (idempotent replay / duplicate). */
  skipped?: "already-at-status" | "already-processed";
}

/**
 * Server-side authorization: read users/{uid} and verify the caller
 * holds an order-operations role. Uses the SAME role fields the
 * Firestore rules check (role == "admin", adminRole in [...],
 * blocked != true) — no parallel permission model exists.
 */
export async function verifyOrderAdmin(
  projectId: string,
  callerUid: string,
): Promise<{ role: string; adminRole: string }> {
  const userPath = docPath(projectId, ["users", callerUid]);
  const docs = await batchGetDocs(projectId, [userPath]);
  const userDoc = docs.get(userPath);
  if (!userDoc?.exists) {
    throw new Error("Authorization failed — caller is not an admin.");
  }
  const role = String(userDoc.data["role"] ?? "customer");
  const adminRole = String(userDoc.data["adminRole"] ?? "");
  const blocked = userDoc.data["blocked"] === true;
  if (
    role !== "admin" ||
    blocked ||
    !(ORDER_ADMIN_ROLES as readonly string[]).includes(adminRole)
  ) {
    throw new Error(
      "Authorization failed — order status updates require an order-operations admin role.",
    );
  }
  return { role, adminRole };
}

/**
 * Admin-initiated canonical transition. Thin orchestration over
 * the existing engine — validation, advancement and event fan-out
 * all happen inside the SAME functions checkout uses.
 */
export async function adminAdvanceOrder(
  projectId: string,
  params: AdminAdvanceOrderParams,
): Promise<AdminAdvanceOrderResult> {
  const { callerUid, callerEmail, customerId, orderId, to, note } = params;

  // 0. Machine vocabulary guard (unknown statuses rejected outright)
  if (!(to in CANONICAL_TRANSITIONS)) {
    throw new Error(`Unknown order status: ${to}`);
  }

  // 1. Server-side authorization (role from users/{uid})
  await verifyOrderAdmin(projectId, callerUid);

  // 2. Build the canonical event context from the order doc
  //    (same shape checkout builds for its dispatches).
  const orderPath = docPath(projectId, ["users", customerId, "orders", orderId]);
  const docs = await batchGetDocs(projectId, [orderPath]);
  const orderDoc = docs.get(orderPath);
  if (!orderDoc?.exists) {
    throw new Error(`Order ${orderId} not found.`);
  }
  const orderData = orderDoc.data as Record<string, unknown>;
  const sellerIds = (orderData["sellerIds"] as string[] | undefined) ?? [];
  const items = ((orderData["items"] as Array<Record<string, unknown>>) ?? []).map((i) => ({
    productId: String(i["productId"] ?? ""),
    quantity: Number(i["quantity"] ?? 0),
    sellerId: i["sellerId"] != null ? String(i["sellerId"]) : undefined,
    categoryId: i["categoryId"] != null ? String(i["categoryId"]) : null,
    subcategoryId: i["subcategoryId"] != null ? String(i["subcategoryId"]) : null,
    lineTotalTaka: i["subtotal"] != null ? Number(i["subtotal"]) : undefined,
  }));
  const total = Number(orderData["total"] ?? 0);

  // 3. Advance (engine: validates the machine + idempotent replay)
  const advance = await advanceOrderStatus(
    projectId,
    customerId,
    orderId,
    to,
    note || "Updated by admin",
  );

  // 4. Dispatch the canonical event (engine: idempotent fan-out).
  //    The admin actor is recorded on the event + audit trail.
  const dispatch = await dispatchOrderEvent(projectId, orderId, to, {
    customerId,
    sellerIds,
    items,
    total,
    note: note || "Updated by admin",
    actor: { uid: callerUid, email: callerEmail ?? null },
  });

  return {
    advanced: advance.advanced,
    from: advance.from,
    to,
    eventId: dispatch.eventId,
    handlersRun: dispatch.handlersRun,
    handlersFailed: dispatch.handlersFailed,
    skipped:
      dispatch.skipped === "already-processed"
        ? "already-processed"
        : advance.advanced
          ? undefined
          : "already-at-status",
  };
}
