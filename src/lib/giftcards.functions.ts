import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const purchaseSchema = z.object({
  idToken: z.string().min(10),
  amount: z.number().min(100).max(100_000),
  recipientName: z.string().trim().min(1).max(100),
  recipientEmail: z.string().trim().email().max(200),
  message: z.string().max(500).optional().default(""),
  theme: z.string().max(50).optional().default("classic"),
});

export type PurchaseGiftCardInput = z.infer<typeof purchaseSchema>;

/**
 * Purchases a gift card. The client sends only the amount, recipient info,
 * and a Firebase ID token. The server independently verifies the user,
 * reads the real wallet balance, deducts atomically, and creates the gift
 * card — all in a single Firestore commit.
 *
 * SECURITY: The user's UID is extracted from the verified ID token, never
 * from client-provided data. The wallet balance is read server-side from
 * the authoritative ledger.
 */
export const purchaseGiftCardFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => purchaseSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { purchaseGiftCardServer } = await import("./giftcards.server");

    const { uid, email } = await verifyIdToken(data.idToken);

    return purchaseGiftCardServer({
      uid,
      email,
      amount: data.amount,
      senderName: email ?? "Shopper",
      senderEmail: email ?? "",
      recipientName: data.recipientName,
      recipientEmail: data.recipientEmail,
      message: data.message,
      theme: data.theme,
    });
  });
