import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ----------------------------------------------------------------
// Seller Reply
// ----------------------------------------------------------------
const sellerReplySchema = z.object({
  idToken: z.string().min(10),
  conversationId: z.string().min(1).max(200),
  customerId: z.string().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

export const sellerReply = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sellerReplySchema.parse(data))
  .handler(async ({ data }) => {
    const { sellerReplyServer } = await import("./seller-messages.server");
    await sellerReplyServer(data.idToken, {
      conversationId: data.conversationId,
      customerId: data.customerId,
      body: data.body,
    });
    return { success: true };
  });

// ----------------------------------------------------------------
// Create Conversation (customer initiates chat with seller)
// ----------------------------------------------------------------
const createConversationSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(1).max(200),
  subject: z.string().trim().min(1).max(200),
  firstMessage: z.string().trim().min(1).max(5000),
  threadId: z.string().min(1).max(200),
  customerName: z.string().max(100).optional(),
  sellerShopName: z.string().max(200).optional(),
});

export const createConversation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createConversationSchema.parse(data))
  .handler(async ({ data }) => {
    const { createConversationServer } = await import("./seller-messages.server");
    const conversationId = await createConversationServer(data.idToken, {
      sellerId: data.sellerId,
      subject: data.subject,
      firstMessage: data.firstMessage,
      threadId: data.threadId,
      customerName: data.customerName,
      sellerShopName: data.sellerShopName,
    });
    return { conversationId };
  });
