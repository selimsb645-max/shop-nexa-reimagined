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

    // TODO: verify uid has finance.withdrawals.process permission
    // For now, verify the user is an admin by checking their role
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
    if (role !== "admin") {
      throw new Error("Only admins can process withdrawals.");
    }

    return processWithdrawalServer({
      adminUid: uid,
      sellerId: data.sellerId,
      withdrawalId: data.withdrawalId,
      action: data.action,
      note: data.note,
    });
  });
