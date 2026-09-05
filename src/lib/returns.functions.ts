// ═══════════════════════════════════════════════════════════════
// AVENTA SHOP — Return & Refund Server Functions (TanStack Start)
// ═══════════════════════════════════════════════════════════════
// These are the callable server functions that the client-side
// services invoke. Each one delegates to returns.server.ts
// for the actual business logic.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ─── Create Return Request ───────────────────────────────────────
const createSchema = z.object({
  idToken: z.string().min(10),
  customerId: z.string().min(1).max(200),
  orderId: z.string().min(1).max(200),
  productId: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(999),
  reason: z.enum([
    "damaged",
    "wrong_item",
    "not_as_described",
    "changed_mind",
    "quality_issue",
    "other",
  ]),
  customerNote: z.string().max(2000),
  images: z.array(z.string().url()).max(5).optional(),
});

export const createReturnFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const { createReturnRequestServer } = await import("./returns.server");
    return createReturnRequestServer(data);
  });

// ─── Review Return ────────────────────────────────────────────────
const reviewSchema = z.object({
  idToken: z.string().min(10),
  returnId: z.string().min(1).max(200),
});

export const reviewReturnFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reviewSchema.parse(data))
  .handler(async ({ data }) => {
    const { reviewReturnServer } = await import("./returns.server");
    return reviewReturnServer(data);
  });

// ─── Approve Return ───────────────────────────────────────────────
const approveSchema = z.object({
  idToken: z.string().min(10),
  returnId: z.string().min(1).max(200),
  note: z.string().max(500).optional(),
});

export const approveReturnFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => approveSchema.parse(data))
  .handler(async ({ data }) => {
    const { approveReturnServer } = await import("./returns.server");
    return approveReturnServer(data);
  });

// ─── Reject Return ────────────────────────────────────────────────
const rejectSchema = z.object({
  idToken: z.string().min(10),
  returnId: z.string().min(1).max(200),
  reason: z.string().min(3).max(500),
});

export const rejectReturnFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => rejectSchema.parse(data))
  .handler(async ({ data }) => {
    const { rejectReturnServer } = await import("./returns.server");
    return rejectReturnServer(data);
  });

// ─── Mark Item Received ───────────────────────────────────────────
const receivedSchema = z.object({
  idToken: z.string().min(10),
  returnId: z.string().min(1).max(200),
});

export const markItemReceivedFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => receivedSchema.parse(data))
  .handler(async ({ data }) => {
    const { markItemReceivedServer } = await import("./returns.server");
    return markItemReceivedServer(data);
  });

// ─── Approve Refund ───────────────────────────────────────────────
const approveRefundSchema = z.object({
  idToken: z.string().min(10),
  returnId: z.string().min(1).max(200),
});

export const approveRefundFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => approveRefundSchema.parse(data))
  .handler(async ({ data }) => {
    const { approveRefundServer } = await import("./returns.server");
    return approveRefundServer(data);
  });

// ─── Process Refund ───────────────────────────────────────────────
const processRefundSchema = z.object({
  idToken: z.string().min(10),
  returnId: z.string().min(1).max(200),
  payoutRef: z.string().max(200).optional(),
});

export const processRefundFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => processRefundSchema.parse(data))
  .handler(async ({ data }) => {
    const { processRefundServer } = await import("./returns.server");
    return processRefundServer(data);
  });

// ─── Cancel Return ────────────────────────────────────────────────
const cancelSchema = z.object({
  idToken: z.string().min(10),
  returnId: z.string().min(1).max(200),
});

export const cancelReturnFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => cancelSchema.parse(data))
  .handler(async ({ data }) => {
    const { cancelReturnServer } = await import("./returns.server");
    return cancelReturnServer(data);
  });

// ─── List Returns ─────────────────────────────────────────────────
const listSchema = z.object({
  idToken: z.string().min(10),
  filter: z.enum(["all", "seller", "pending", "active"]).optional(),
  sellerId: z.string().max(200).optional(),
});

export const listReturnsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data }) => {
    const { listReturnsServer } = await import("./returns.server");
    return listReturnsServer(data);
  });
