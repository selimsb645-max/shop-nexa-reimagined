// ═══════════════════════════════════════════════════════════════
// AVENTA SHOP — Customer Support Chat bridges (TanStack server fns)
// Thin zod-validated wrappers over support-chat.server.ts.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({ idToken: z.string().min(10) });

const sendSchema = z.object({
  idToken: z.string().min(10),
  text: z.string().trim().min(1).max(2000),
});

export const getSupportChat = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }) => {
    const { getSupportChatServer } = await import("./support-chat.server");
    return getSupportChatServer(data.idToken);
  });

export const getSupportUnread = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }) => {
    const { getSupportUnreadServer } = await import("./support-chat.server");
    return getSupportUnreadServer(data.idToken);
  });

export const sendSupportMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data }) => {
    const { sendSupportMessageServer } = await import("./support-chat.server");
    return sendSupportMessageServer(data.idToken, data.text);
  });
