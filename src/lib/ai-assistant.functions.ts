import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(1000),
});

const aiChatSchema = z.object({
  idToken: z.string().min(10),
  message: z.string().trim().min(1).max(1000),
  history: z.array(chatMessageSchema).max(20).default([]),
});

// ═══════════════════════════════════════════════════════════════
// SERVER FUNCTION
// ═══════════════════════════════════════════════════════════════

export const aiChat = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => aiChatSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { chatWithAI } = await import("./ai-assistant.server");

    // 1. Verify the user is authenticated
    const { uid } = await verifyIdToken(data.idToken);

    // 2. Call the AI with validated input
    const result = await chatWithAI(uid, data.message, data.history);

    // 3. Return only safe fields (never expose API keys, internal errors, etc.)
    return {
      reply: result.reply,
      source: result.source,
    };
  });
