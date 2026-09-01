import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const withdrawSchema = z.object({
  idToken: z.string().min(10),
  amount: z.number().min(10).max(100_000),
  method: z.enum(["bank", "bkash", "nagad", "rocket"]),
  destination: z.string().trim().min(4).max(200),
});

const processSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(1).max(200),
  withdrawalId: z.string().min(1).max(200),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

/**
 * Request a withdrawal (seller action).
 * Verifies Firebase ID token, reads authoritative balance, creates withdrawal.
 */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => withdrawSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { requestWithdrawalServer } = await import("./withdraw.server");

    const { uid } = await verifyIdToken(data.idToken);

    return requestWithdrawalServer({
      uid,
      amount: data.amount,
      method: data.method,
      destination: data.destination,
    });
  });

/**
 * Process a withdrawal (admin action).
 * Verifies admin permissions before processing.
 */
export const processWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => processSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { processWithdrawalServer } = await import("./withdraw.server");

    const { uid } = await verifyIdToken(data.idToken);

    // SECURITY: verify the caller is an admin AND holds a finance-capable
    // sub-role (finance.withdrawals.process). Sub-role checks must happen here,
    // never only in client-side permission maps.
    const token = await import("./firebase-admin.server").then((m) =>
      m.getAccessToken(),
    );
    const projectId = await import("./firebase-admin.server").then((m) =>
      m.getProjectId(),
    );
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Could not verify admin permissions.");
    const userDoc = await userRes.json();
    const role = userDoc.fields?.role?.stringValue;
    const adminRole = userDoc.fields?.adminRole?.stringValue ?? null;
    if (role !== "admin" || (adminRole !== "super_admin" && adminRole !== "finance_admin")) {
      throw new Error("Only finance admins can process withdrawals.");
    }

    return processWithdrawalServer({
      adminUid: uid,
      sellerId: data.sellerId,
      withdrawalId: data.withdrawalId,
      action: data.action,
      note: data.note,
    });
  });
