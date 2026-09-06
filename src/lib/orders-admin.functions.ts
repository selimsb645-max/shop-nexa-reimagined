// ═══════════════════════════════════════════════════════════════
// Admin Order Transition — TanStack server function (PART 1)
// ═══════════════════════════════════════════════════════════════
// Thin transport wrapper around orders-admin.server.ts
// (adminAdvanceOrder). All security and business logic lives in
// the server module; this layer only verifies the Firebase ID
// token and forwards the caller identity. Exposed so the
// storefront-deployed backend (and any future admin console on
// the same app) can advance orders through the CANONICAL engine
// instead of writing Firestore directly.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CANONICAL_TRANSITIONS,
  type CanonicalOrderStatus,
} from "./orderStateMachine";

const canonicalStatuses = Object.keys(CANONICAL_TRANSITIONS) as CanonicalOrderStatus[];

const adminAdvanceSchema = z.object({
  idToken: z.string().min(10),
  customerId: z.string().min(1).max(200),
  orderId: z.string().min(1).max(200),
  to: z.enum(canonicalStatuses as [CanonicalOrderStatus, ...CanonicalOrderStatus[]]),
  note: z.string().max(500).optional().default(""),
});

export const adminAdvanceOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminAdvanceSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("./firebase-admin.server");
    const { adminAdvanceOrder: run } = await import("./orders-admin.server");

    // Transport-level identity only — role authorization happens
    // inside the engine service from users/{uid} (server-side).
    const { uid, email } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();

    return run(projectId, {
      callerUid: uid,
      callerEmail: email ?? null,
      customerId: data.customerId,
      orderId: data.orderId,
      to: data.to,
      note: data.note,
    });
  });
