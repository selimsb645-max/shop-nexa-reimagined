// ═══════════════════════════════════════════════════════════════
// Support chat client service — bridges only, zero client Firestore
// writes (deny-all rules untouched).
// ═══════════════════════════════════════════════════════════════

import { getFirebaseAuth } from "@/services/firebase/config";

export interface SupportMessage {
  id: string;
  sender: "customer" | "admin";
  senderName: string;
  text: string;
  createdAt: number;
}

export interface SupportThread {
  id: string;
  status: "open" | "resolved";
  unreadByCustomer: boolean;
  lastMessageAt: number;
}

async function idToken(): Promise<string> {
  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("Please sign in to chat with support.");
  return current.getIdToken();
}

export async function fetchSupportChat(): Promise<{
  thread: SupportThread;
  messages: SupportMessage[];
}> {
  const token = await idToken();
  const { getSupportChat } = await import("@/lib/support-chat.functions");
  return getSupportChat({ data: { idToken: token } });
}

export async function fetchSupportUnread(): Promise<number> {
  const token = await idToken();
  const { getSupportUnread } = await import("@/lib/support-chat.functions");
  const res = await getSupportUnread({ data: { idToken: token } });
  return res.count;
}

export async function sendSupportChatMessage(text: string): Promise<void> {
  const token = await idToken();
  const { sendSupportMessage } = await import("@/lib/support-chat.functions");
  await sendSupportMessage({ data: { idToken: token, text } });
}
