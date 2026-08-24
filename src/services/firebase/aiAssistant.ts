/**
 * Client-side AI Assistant service.
 *
 * Calls the server function (aiChat) which processes the request server-side.
 * The API key is NEVER present in the client bundle — only the idToken
 * (Firebase auth token) is sent, and the server validates it.
 */

import { aiChat } from "@/lib/ai-assistant.functions";
import type { ChatMessage } from "@/lib/ai-assistant.server";

export type { ChatMessage };

export interface AIChatResult {
  reply: string;
  source: "ai" | "fallback";
}

/**
 * Send a message to the AI assistant and get a response.
 *
 * @param idToken  Firebase auth token (from user.getIdToken())
 * @param message  The user's message
 * @param history  Previous conversation messages (for context)
 */
export async function sendAIMessage(
  idToken: string,
  message: string,
  history: ChatMessage[],
): Promise<AIChatResult> {
  const result = await aiChat({
    data: { idToken, message, history },
  });
  return {
    reply: result.reply,
    source: result.source as "ai" | "fallback",
  };
}
