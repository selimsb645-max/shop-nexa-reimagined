/**
 * Aventa Shop — Order Tracking Server Functions (Phase 1)
 *
 * Server-validated status updates with:
 * - Immutable status history
 * - Audit logging
 * - Notification dispatch
 * - Delivery agent assignment
 * - Status transition enforcement
 *
 * SECURITY: All status mutations go through these server functions.
 * The client NEVER writes status/tracking fields directly to Firestore.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  verifyIdToken,
  getProjectId,
  batchGetDocs,
  commitWrites,
  toFsFields,
  toFsValue,
  fromFsValue,
  docPath,
  newDocId,
  type FsWrite,
} from "./firebase-admin.server";

import {
  generateTrackingId,
  isValidTransition,
  canDeliveryAgentSet,
  computeExpectedDelivery,
} from "./tracking-utils";

import type { TrackingOrderStatus, TrackingUserRole, DeliveryInfo } from "@/types/tracking";

// ====================================================================
// HELPERS
// ====================================================================

function nowMs(): number {
  return Date.now();
}

async function getUserRole(projectId: string, uid: string): Promise<TrackingUserRole> {
  const userDoc = await batchGetDocs(projectId, [docPath(projectId, ["users", uid])]);
  const userPath = docPath(projectId, ["users", uid]);
  const userData = userDoc.get(userPath);
  if (userData?.exists) {
    const role = String(userData.data["role"] ?? "customer");
    if (role === "admin") return "admin";
  }
  // Check if seller
  const sellerDoc = await batchGetDocs(projectId, [docPath(projectId, ["sellers", uid])]);
  const sellerPath = docPath(projectId, ["sellers", uid]);
  const sellerData = sellerDoc.get(sellerPath);
  if (sellerData?.exists && String(sellerData.data["status"] ?? "") === "approved") {
    return "seller";
  }
  // Check if delivery agent
  const agentDoc = await batchGetDocs(projectId, [docPath(projectId, ["deliveryAgents", uid])]);
  const agentPath = docPath(projectId, ["deliveryAgents", uid]);
  const agentData = agentDoc.get(agentPath);
  if (agentData?.exists) return "delivery_agent";
  return "customer";
}

/**
 * Finds the buyer order doc path by orderId using collectionGroup query.
 * Returns { userId, path } or null.
 */
async function findBuyerOrder(
  projectId: string,
  orderId: string,
): Promise<{ userId: string; path: string; data: Record<string, unknown> } | null> {
  const token = await import("./firebase-admin.server").then((m) => m.getAccessToken());
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: "orders", allDescendants: true }],
      where: {
        fieldFilter: {
          field: { fieldPath: "__name__" },
          op: "EQUAL",
          value: {
            referenceValue: docPath(projectId, ["orders", orderId]).replace(
              "projects/" + projectId + "/databases/(default)/documents/",
              "",
            ),
          },
        },
      },
      limit: 10,
    },
  });
  // Fallback: use collectionGroup via REST list with filter
  // Actually simpler: just search users/*/orders/{orderId}
  // We don't know userId, so we use runQuery with a filter on orderId
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "orders", allDescendants: true }],
        where: {
          fieldFilter: {
            field: { fieldPath: "orderId" },
            op: "EQUAL",
            value: { stringValue: orderId },
          },
        },
      },
    }),
  });
  if (!res.ok) return null;
  const results = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, unknown> };
  }>;
  for (const r of results) {
    if (r.document) {
      const path = r.document.name;
      // Extract userId from path: .../users/{uid}/orders/{orderId}
      const match = path.match(/users\/([^/]+)\/orders\//);
      if (match) {
        const userId = match[1];
        const data = r.document.fields
          ? Object.fromEntries(
              Object.entries(r.document.fields).map(([k, v]) => [
                k,
                fromFsValue(v as Parameters<typeof fromFsValue>[0]),
              ]),
            )
          : {};
        return { userId, path, data };
      }
    }
  }
  return null;
}

// ====================================================================
// 1. UPDATE ORDER STATUS
// ====================================================================

const updateStatusSchema = z.object({
  idToken: z.string().min(10),
  orderId: z.string().min(1).max(200),
  newStatus: z.enum([
    "pending",
    "confirmed",
    "processing",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "return_requested",
    "returned",
  ]),
  note: z.string().max(500).optional().default(""),
  expectedDeliveryDate: z.number().optional(),
});

export const updateOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const { uid, email } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const role = await getUserRole(projectId, uid);

    // Delivery agents have restricted status access
    if (role === "delivery_agent") {
      if (!canDeliveryAgentSet("shipped", data.newStatus as TrackingOrderStatus)) {
        throw new Error("Delivery agents can only update to 'out_for_delivery' or 'delivered'.");
      }
    }

    // Find the buyer order
    const buyerOrder = await findBuyerOrder(projectId, data.orderId);
    if (!buyerOrder) throw new Error("Order not found.");

    const currentStatus = String(buyerOrder.data["status"] ?? "pending") as TrackingOrderStatus;

    // Validate transition
    if (!isValidTransition(currentStatus, data.newStatus as TrackingOrderStatus)) {
      throw new Error(`Invalid status transition: ${currentStatus} → ${data.newStatus}`);
    }

    // Authorization checks
    if (role === "seller") {
      const sellerIds = (buyerOrder.data["sellerIds"] as string[] | undefined) ?? [];
      if (!sellerIds.includes(uid)) {
        throw new Error("You are not authorized to manage this order.");
      }
    } else if (role === "delivery_agent") {
      const deliveryInfo =
        (buyerOrder.data["deliveryInfo"] as Record<string, unknown> | undefined) ?? {};
      if (String(deliveryInfo["deliveryAgentId"] ?? "") !== uid) {
        throw new Error("This order is not assigned to you.");
      }
    } else if (role === "customer") {
      throw new Error("Customers cannot update order status.");
    }

    const ts = nowMs();
    const writes: FsWrite[] = [];
    const historyId = newDocId();
    const auditId = newDocId();

    // Get or generate tracking ID
    let trackingId = String(buyerOrder.data["trackingId"] ?? "");
    if (!trackingId) {
      trackingId = generateTrackingId();
    }

    // Update buyer order
    const orderUpdate: Record<string, unknown> = {
      status: data.newStatus,
      trackingId,
      updatedAt: ts,
    };

    // Add tracking event to existing tracking array
    const existingTracking = (buyerOrder.data["tracking"] as unknown[]) ?? [];
    const newTracking = [
      ...existingTracking,
      {
        status: data.newStatus,
        note: data.note || `Order marked as ${data.newStatus} by ${role}`,
        at: ts,
        updatedBy: uid,
        updatedByRole: role,
      },
    ];
    orderUpdate["tracking"] = newTracking;

    // Update delivery info for delivery-related statuses
    const deliveryInfo =
      (buyerOrder.data["deliveryInfo"] as Record<string, unknown> | undefined) ?? {};
    const updatedDeliveryInfo: Record<string, unknown> = { ...deliveryInfo };
    if (data.expectedDeliveryDate) {
      updatedDeliveryInfo["expectedDeliveryDate"] = data.expectedDeliveryDate;
    }
    if (data.newStatus === "out_for_delivery") {
      updatedDeliveryInfo["outForDeliveryAt"] = ts;
    }
    if (data.newStatus === "delivered") {
      updatedDeliveryInfo["deliveredAt"] = ts;
    }
    orderUpdate["deliveryInfo"] = updatedDeliveryInfo;

    writes.push({
      update: {
        name: buyerOrder.path,
        fields: toFsFields(orderUpdate),
      },
      updateMask: {
        fieldPaths: Object.keys(orderUpdate),
      },
    });

    // Create status history entry
    writes.push({
      update: {
        name: docPath(projectId, ["orderStatusHistory", historyId]),
        fields: toFsFields({
          id: historyId,
          orderId: data.orderId,
          trackingId,
          status: data.newStatus,
          previousStatus: currentStatus,
          updatedBy: uid,
          updatedByRole: role,
          note: data.note || `Order marked as ${data.newStatus} by ${role}`,
          timestamp: ts,
        }),
      },
      currentDocument: { exists: false },
    });

    // Create audit log entry
    writes.push({
      update: {
        name: docPath(projectId, ["orderAuditLogs", auditId]),
        fields: toFsFields({
          id: auditId,
          orderId: data.orderId,
          trackingId,
          previousStatus: currentStatus,
          newStatus: data.newStatus,
          changedBy: uid,
          changedByRole: role,
          timestamp: ts,
          note: data.note || `Status changed from ${currentStatus} to ${data.newStatus}`,
        }),
      },
      currentDocument: { exists: false },
    });

    // Sync seller order mirrors
    const sellerIds = (buyerOrder.data["sellerIds"] as string[] | undefined) ?? [];
    for (const sid of sellerIds) {
      const sellerOrderPath = docPath(projectId, ["sellers", sid, "orders", data.orderId]);
      const sellerUpdate: Record<string, unknown> = {
        status: data.newStatus,
        updatedAt: ts,
      };
      writes.push({
        update: {
          name: sellerOrderPath,
          fields: toFsFields(sellerUpdate),
        },
        updateMask: { fieldPaths: Object.keys(sellerUpdate) },
      });
    }

    // Create notification event (fire-and-forget)
    try {
      const { sendOrderNotification } = await import("./notifications.server");
      const buyerName = String(
        ((buyerOrder.data["shippingAddress"] as Record<string, unknown>) ?? {})["fullName"] ??
          "Customer",
      );
      const buyerPhone = String(
        ((buyerOrder.data["shippingAddress"] as Record<string, unknown>) ?? {})["phone"] ?? "",
      );
      const orderTotal = Number(buyerOrder.data["total"] ?? 0);

      const eventMap: Record<string, string> = {
        confirmed: "ORDER_CONFIRMED",
        packed: "ORDER_PROCESSING",
        shipped: "ORDER_SHIPPED",
        out_for_delivery: "OUT_FOR_DELIVERY",
        delivered: "ORDER_DELIVERED",
        cancelled: "ORDER_CANCELLED",
      };
      const event = eventMap[data.newStatus];
      if (event) {
        await sendOrderNotification(event as Parameters<typeof sendOrderNotification>[0], {
          orderId: data.orderId,
          customerName: buyerName,
          phoneNumber: buyerPhone,
          orderTotal,
        });
      }

      // Also create an in-app notification for the buyer
      const notifId = newDocId();
      writes.push({
        update: {
          name: docPath(projectId, ["users", buyerOrder.userId, "notificationLogs", notifId]),
          fields: toFsFields({
            id: notifId,
            type: "order_update",
            title: `Order ${data.newStatus.replace(/_/g, " ")}`,
            message:
              data.note || `Your order has been updated to: ${data.newStatus.replace(/_/g, " ")}`,
            orderId: data.orderId,
            trackingId,
            read: false,
            createdAt: ts,
          }),
        },
        currentDocument: { exists: false },
      });
    } catch {
      // Non-fatal: notification failure shouldn't block status update
    }

    await commitWrites(projectId, writes);

    return {
      found: true as const,
      success: true,
      orderId: data.orderId,
      trackingId,
      previousStatus: currentStatus,
      newStatus: data.newStatus,
      timestamp: ts,
    };
  });

// ====================================================================
// 2. ASSIGN DELIVERY AGENT
// ====================================================================

const assignAgentSchema = z.object({
  idToken: z.string().min(10),
  orderId: z.string().min(1).max(200),
  agentId: z.string().min(1).max(200),
  expectedDeliveryDate: z.number().optional(),
});

export const assignDeliveryAgent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => assignAgentSchema.parse(data))
  .handler(async ({ data }) => {
    const { uid } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const role = await getUserRole(projectId, uid);

    if (role !== "admin" && role !== "seller") {
      throw new Error("Only admins and sellers can assign delivery agents.");
    }

    // Get agent doc
    const agentDocs = await batchGetDocs(projectId, [
      docPath(projectId, ["deliveryAgents", data.agentId]),
    ]);
    const agentDoc = agentDocs.get(docPath(projectId, ["deliveryAgents", data.agentId]));
    if (!agentDoc?.exists) throw new Error("Delivery agent not found.");

    const agentName = String(agentDoc.data["name"] ?? "");
    const agentPhone = String(agentDoc.data["phone"] ?? "");

    // Find the buyer order
    const buyerOrder = await findBuyerOrder(projectId, data.orderId);
    if (!buyerOrder) throw new Error("Order not found.");

    // Seller authorization check
    if (role === "seller") {
      const sellerIds = (buyerOrder.data["sellerIds"] as string[] | undefined) ?? [];
      if (!sellerIds.includes(uid)) {
        throw new Error("You are not authorized to manage this order.");
      }
    }

    // Check order must be shipped or later to assign agent
    const currentStatus = String(buyerOrder.data["status"] ?? "pending") as TrackingOrderStatus;
    const flowIndex = [
      "pending",
      "confirmed",
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
    ];
    if (flowIndex.indexOf(currentStatus) < flowIndex.indexOf("shipped")) {
      throw new Error("Order must be shipped before assigning a delivery agent.");
    }

    const ts = nowMs();
    const expectedDate = data.expectedDeliveryDate ?? computeExpectedDelivery(currentStatus, ts);
    let trackingId = String(buyerOrder.data["trackingId"] ?? "");
    if (!trackingId) trackingId = generateTrackingId();

    const writes: FsWrite[] = [];

    const deliveryInfo: DeliveryInfo = {
      deliveryAgentId: data.agentId,
      deliveryAgentName: agentName,
      deliveryAgentPhone: agentPhone,
      assignedAt: ts,
      pickedUpAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      expectedDeliveryDate: expectedDate,
    };

    // Update buyer order with delivery info
    writes.push({
      update: {
        name: buyerOrder.path,
        fields: toFsFields({
          trackingId,
          deliveryInfo,
          updatedAt: ts,
        }),
      },
      updateMask: { fieldPaths: ["trackingId", "deliveryInfo", "updatedAt"] },
    });

    // Add to agent's assignedOrderIds
    const existingAssigned = (agentDoc.data["assignedOrderIds"] as unknown[]) ?? [];
    if (!existingAssigned.includes(data.orderId)) {
      const updatedAssigned = [...existingAssigned, data.orderId];
      writes.push({
        update: {
          name: docPath(projectId, ["deliveryAgents", data.agentId]),
          fields: toFsFields({
            assignedOrderIds: updatedAssigned,
            status: "busy",
            updatedAt: ts,
          }),
        },
        updateMask: { fieldPaths: ["assignedOrderIds", "status", "updatedAt"] },
      });
    }

    // Status history entry
    const historyId = newDocId();
    writes.push({
      update: {
        name: docPath(projectId, ["orderStatusHistory", historyId]),
        fields: toFsFields({
          id: historyId,
          orderId: data.orderId,
          trackingId,
          status: currentStatus,
          previousStatus: currentStatus,
          updatedBy: uid,
          updatedByRole: role,
          note: `Delivery agent assigned: ${agentName} (${agentPhone})`,
          timestamp: ts,
        }),
      },
      currentDocument: { exists: false },
    });

    await commitWrites(projectId, writes);

    return {
      found: true as const,
      success: true,
      agentName,
      agentPhone,
      expectedDeliveryDate: expectedDate,
    };
  });

// ====================================================================
// 3. GET TRACKING BY ID (public lookup)
// ====================================================================

const trackingLookupSchema = z.object({
  trackingId: z.string().min(3).max(30),
});

export const getTrackingBy = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => trackingLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const projectId = getProjectId();
    const token = await import("./firebase-admin.server").then((m) => m.getAccessToken());

    // Query orderStatusHistory by trackingId to find the orderId
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "orderStatusHistory" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "trackingId" },
              op: "EQUAL",
              value: { stringValue: data.trackingId.toUpperCase() },
            },
          },
          limit: 1,
        },
      }),
    });
    if (!res.ok)
      return {
        found: false,
        orderId: "",
        trackingId: data.trackingId.toUpperCase(),
        currentStatus: "pending",
        history: [] as Array<{
          status: string;
          note: string;
          timestamp: number;
          orderId: string;
          trackingId: string;
        }>,
      };
    const results = (await res.json()) as Array<{
      document?: { name: string; fields?: Record<string, unknown> };
    }>;
    if (!results[0]?.document)
      return {
        found: false,
        orderId: "",
        trackingId: data.trackingId.toUpperCase(),
        currentStatus: "pending",
        history: [] as Array<{
          status: string;
          note: string;
          timestamp: number;
          orderId: string;
          trackingId: string;
        }>,
      };

    const firstEntry = results[0].document.fields ?? {};
    const orderId = String(firstEntry["orderId"] ?? "");

    // Get full status history
    const historyRes = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "orderStatusHistory" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "trackingId" },
              op: "EQUAL",
              value: { stringValue: data.trackingId.toUpperCase() },
            },
          },
          orderBy: [{ field: { fieldPath: "timestamp" }, direction: "ASCENDING" }],
        },
      }),
    });

    let history: Array<{
      status: string;
      note: string;
      timestamp: number;
      orderId: string;
      trackingId: string;
    }> = [];
    if (historyRes.ok) {
      const historyResults = (await historyRes.json()) as Array<{
        document?: { fields?: Record<string, unknown> };
      }>;
      history = historyResults
        .filter((r: { document?: { fields?: Record<string, unknown> } }) => r.document?.fields)
        .map((r) => {
          const fields = r.document!.fields!;
          return {
            status: String(
              fields["status"]
                ? fromFsValue(fields["status"] as Parameters<typeof fromFsValue>[0])
                : "pending",
            ),
            note: String(
              fields["note"]
                ? fromFsValue(fields["note"] as Parameters<typeof fromFsValue>[0])
                : "",
            ),
            timestamp: Number(
              fields["timestamp"]
                ? fromFsValue(fields["timestamp"] as Parameters<typeof fromFsValue>[0])
                : 0,
            ),
            orderId: String(
              fields["orderId"]
                ? fromFsValue(fields["orderId"] as Parameters<typeof fromFsValue>[0])
                : "",
            ),
            trackingId: String(
              fields["trackingId"]
                ? fromFsValue(fields["trackingId"] as Parameters<typeof fromFsValue>[0])
                : "",
            ),
          };
        });
    }

    return {
      found: true,
      orderId,
      trackingId: data.trackingId.toUpperCase(),
      currentStatus: String(firstEntry["status"] ?? "pending"),
      history,
    };
  });
