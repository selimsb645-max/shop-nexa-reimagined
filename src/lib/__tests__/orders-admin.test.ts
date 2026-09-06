// ═══════════════════════════════════════════════════════════════
// Admin Order Transition Service tests (PART 1 — event fan-out)
// ═══════════════════════════════════════════════════════════════
// Verifies adminAdvanceOrder (orders-admin.server.ts):
//  • server-side role gate (order-operations roles only)
//  • canonical machine validation (17 statuses, unchanged)
//  • idempotency — replay never duplicates events/notifications
//  • deterministic event ids — cross-path duplicate prevention
//  • financial fields never written
//  • the human actor lands on the audit trail
// ═══════════════════════════════════════════════════════════════
import { beforeEach, describe, expect, it, vi } from "vitest";

let writes: Array<{ update?: { name: string; fields: Record<string, unknown> }; updateMask?: { fieldPaths: string[] } }> = [];
let docs: Record<string, Record<string, unknown>> = {};

vi.mock("../firebase-admin.server", () => ({
  commitWrites: vi.fn(async (_p: string, w: unknown[]) => {
    for (const write of w as Array<{ update?: { name: string; fields: Record<string, unknown> } }>) {
      writes.push(write);
      if (write.update) {
        const id = write.update.name.split("/").slice(-2).join("/");
        docs[id] = { ...(docs[id] ?? {}), ...write.update.fields };
      }
    }
  }),
  batchGetDocs: vi.fn(async (_p: string, names: string[]) => {
    const out = new Map<string, { exists: boolean; data: Record<string, unknown>; updateTime: string | null }>();
    for (const name of names) {
      const id = name.split("/").slice(-2).join("/");
      const d = docs[id];
      out.set(name, d
        ? { exists: true, data: JSON.parse(JSON.stringify(d)), updateTime: "u1" }
        : { exists: false, data: {}, updateTime: null });
    }
    return out;
  }),
  docPath: (projectId: string, segments: string[]) =>
    `projects/${projectId}/databases/(default)/documents/${segments.join("/")}`,
  toFsFields: (obj: Record<string, unknown>) => obj as never,
}));

import {
  adminAdvanceOrder,
  verifyOrderAdmin,
  ORDER_ADMIN_ROLES,
} from "../orders-admin.server";

const PID = "test-project";

function orderPath(orderId: string) {
  return `projects/${PID}/databases/(default)/documents/users/cu1/orders/${orderId}`;
}

beforeEach(() => {
  writes = [];
  docs = {
    "users/om1": { role: "admin", adminRole: "order_manager", blocked: false },
    "users/sa1": { role: "admin", adminRole: "super_admin", blocked: false },
    "users/su1": { role: "admin", adminRole: "support_admin", blocked: false },
    "users/ba1": { role: "admin", adminRole: "order_manager", blocked: true },
    "users/cu2": { role: "customer", blocked: false },
    "orders/o1": {
      status: "PROCESSING",
      sellerIds: ["se1"],
      items: [{ productId: "p1", quantity: 2, sellerId: "se1", subtotal: 1500 }],
      total: 1500,
      tracking: [],
      payment: { status: "paid" },
    },
  };
});

describe("PART 1 — adminAdvanceOrder (canonical engine entry)", () => {
  it("advances a valid transition through the engine", async () => {
    const r = await adminAdvanceOrder(PID, {
      callerUid: "om1", callerEmail: "om1@test.dev",
      customerId: "cu1", orderId: "o1", to: "PACKED", note: "Boxed",
    });
    expect(r.advanced).toBe(true);
    expect(r.from).toBe("PROCESSING");
    expect(r.eventId).toBe("o1__PACKED");
    expect(r.handlersRun).toContain("audit");
    expect(r.skipped).toBeUndefined();

    // Order doc advanced with the canonical value
    const orderWrites = writes.filter((w) => w.update?.name === orderPath("o1"));
    expect(orderWrites).toHaveLength(1);
    expect(orderWrites[0].update!.fields["status"]).toBe("PACKED");
  });

  it("records the HUMAN actor on the audit trail (not 'system')", async () => {
    await adminAdvanceOrder(PID, {
      callerUid: "om1", callerEmail: "om1@test.dev",
      customerId: "cu1", orderId: "o1", to: "PACKED", note: "",
    });
    const audit = writes.find((w) =>
      w.update?.name.includes("activityLogs/act_o1_packed"));
    expect(audit).toBeTruthy();
    expect(audit!.update!.fields["actorUid"]).toBe("om1");
    expect(audit!.update!.fields["actorEmail"]).toBe("om1@test.dev");
    expect(String(audit!.update!.fields["details"])).toContain("by om1@test.dev");
  });

  it("writes ONLY operational fields — financial lock holds", async () => {
    await adminAdvanceOrder(PID, {
      callerUid: "sa1", callerEmail: "sa1@test.dev",
      customerId: "cu1", orderId: "o1", to: "PACKED", note: "",
    });
    const orderWrites = writes.filter((w) => w.update?.name === orderPath("o1"));
    expect(orderWrites).toHaveLength(1);
    expect(Object.keys(orderWrites[0].update!.fields).sort()).toEqual(
      ["status", "tracking", "updatedAt"].sort(),
    );
    // REGRESSION (Sep 6): updateMask MUST restrict the order write to the
    // operational fields — without it the REST commit REPLACES the whole
    // document and wipes financial data (items/total/payment).
    expect(orderWrites[0].updateMask).toEqual({
      fieldPaths: ["status", "tracking", "updatedAt"],
    });
  });

  it("rejects unauthorized roles (server-side authorization)", async () => {
    const base = { customerId: "cu1", orderId: "o1", to: "PACKED", note: "" } as const;
    await expect(adminAdvanceOrder(PID, { ...base, callerUid: "cu2" })).rejects.toThrow(/Authorization failed/);
    await expect(adminAdvanceOrder(PID, { ...base, callerUid: "su1" })).rejects.toThrow(/Authorization failed/);
    await expect(adminAdvanceOrder(PID, { ...base, callerUid: "ba1" })).rejects.toThrow(/Authorization failed/);
    await expect(adminAdvanceOrder(PID, { ...base, callerUid: "ghost" })).rejects.toThrow(/Authorization failed/);
    // Nothing was written — the gate fires before any mutation
    expect(writes).toHaveLength(0);
  });

  it("rejects an unknown target status", async () => {
    await expect(adminAdvanceOrder(PID, {
      callerUid: "om1", customerId: "cu1", orderId: "o1",
      to: "NOT_A_STATUS" as never, note: "",
    })).rejects.toThrow(/Unknown order status/);
    expect(writes).toHaveLength(0);
  });

  it("rejects an invalid machine transition and writes nothing", async () => {
    await expect(adminAdvanceOrder(PID, {
      callerUid: "om1", customerId: "cu1", orderId: "o1",
      to: "DELIVERED", note: "",
    })).rejects.toThrow(/Invalid transition/);
    expect(writes).toHaveLength(0);
  });

  it("is idempotent on same-status replay (no duplicate event)", async () => {
    const r1 = await adminAdvanceOrder(PID, {
      callerUid: "om1", customerId: "cu1", orderId: "o1", to: "PACKED", note: "x",
    });
    expect(r1.advanced).toBe(true);

    const before = writes.length;
    const r2 = await adminAdvanceOrder(PID, {
      callerUid: "om1", customerId: "cu1", orderId: "o1", to: "PACKED", note: "x retry",
    });
    expect(r2.advanced).toBe(false);
    expect(r2.skipped).toBe("already-processed");
    // Replay dispatches nothing new beyond the (skipped) event probe
    expect(writes.slice(before)).toHaveLength(0);
  });

  it("skips fan-out when the canonical event already exists (cross-path duplicate prevention)", async () => {
    // A checkout-path dispatch already processed this event type
    docs["orderEvents/o1__PACKED"] = {
      orderId: "o1", type: "PACKED", state: "processed", processedAt: 1,
    };
    const r = await adminAdvanceOrder(PID, {
      callerUid: "om1", customerId: "cu1", orderId: "o1", to: "PACKED", note: "",
    });
    expect(r.advanced).toBe(true);           // status write is safe to repeat
    expect(r.skipped).toBe("already-processed");
    expect(r.handlersRun).toEqual([]);       // NO handlers ran
    // No event-doc rewrite, no notifications, no audit duplicate
    const eventRewrites = writes.filter((w) =>
      w.update?.name.includes("orderEvents/o1__PACKED"));
    expect(eventRewrites).toHaveLength(0);
  });

  it("fans out notifications for handler-mapped types", async () => {
    docs["orders/o1"].status = "IN_TRANSIT";
    const r = await adminAdvanceOrder(PID, {
      callerUid: "om1", callerEmail: "om1@test.dev",
      customerId: "cu1", orderId: "o1", to: "OUT_FOR_DELIVERY", note: "",
    });
    expect(r.advanced).toBe(true);
    // OUT_FOR_DELIVERY → shipment (no shipment doc → no-op) + notifyCustomer + audit
    expect(r.handlersRun).toContain("notifyCustomer");
    expect(r.handlersRun).toContain("audit");
    const customerNotif = writes.find((w) =>
      w.update?.name.includes("users/cu1/notifications/n_o1_out_for_delivery"));
    expect(customerNotif).toBeTruthy();
    expect(customerNotif!.update!.fields["eventType"]).toBe("OUT_FOR_DELIVERY");
    expect(customerNotif!.update!.fields["eventOrderId"]).toBe("o1");
  });

  it("throws when the order does not exist", async () => {
    await expect(adminAdvanceOrder(PID, {
      callerUid: "om1", customerId: "cu1", orderId: "missing", to: "PACKED", note: "",
    })).rejects.toThrow(/not found/i);
  });
});

describe("PART 1 — verifyOrderAdmin (role gate)", () => {
  it("exposes exactly the order-operations roles the rules grant", () => {
    expect([...ORDER_ADMIN_ROLES]).toEqual(["super_admin", "admin", "order_manager"]);
  });

  it("approves order_manager and super_admin, rejects the rest", async () => {
    await expect(verifyOrderAdmin(PID, "om1")).resolves.toEqual({ role: "admin", adminRole: "order_manager" });
    await expect(verifyOrderAdmin(PID, "sa1")).resolves.toEqual({ role: "admin", adminRole: "super_admin" });
    await expect(verifyOrderAdmin(PID, "su1")).rejects.toThrow();
    await expect(verifyOrderAdmin(PID, "cu2")).rejects.toThrow();
  });
});
