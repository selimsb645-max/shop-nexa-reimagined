/**
 * Seller Conversations Service
 *
 * Uses a top-level `conversations` collection where both customer and seller
 * are participants. This avoids the Firestore rules limitation where sellers
 * can't access customer's personal collections (users/{customerUid}/...).
 *
 * Conversation doc fields:
 * - customerId, sellerId, customerName, sellerShopName
 * - subject, lastMessage, lastAt
 * - customerUnread, sellerUnread
 * - threadId (links to customer's personal thread)
 * - createdAt
 *
 * Messages subcollection: conversations/{convId}/messages/{msgId}
 * - from: "customer" | "seller", senderId, body, createdAt
 *
 * Security: Firestore rules allow access only when request.auth.uid matches
 * customerId OR sellerId on the conversation doc.
 *
 * Seller replies go through a server function (sellerReply) that writes
 * to BOTH the conversation and the customer's personal messages collection
 * (since sellers can't write to customer's collections directly).
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import { toMs } from "./timestamps";
import type { SellerConversation, ConversationMessage } from "@/types/customer";
import { sellerReply, createConversation } from "@/lib/seller-messages.functions";

function conversationsCol() {
  return collection(getDb(), "conversations");
}

function convMsgCol(convId: string) {
  return collection(getDb(), "conversations", convId, "messages");
}

function mapConversation(id: string, d: Record<string, unknown>): SellerConversation {
  return {
    id,
    customerId: String(d.customerId ?? ""),
    sellerId: String(d.sellerId ?? ""),
    customerName: String(d.customerName ?? "Customer"),
    sellerShopName: String(d.sellerShopName ?? "Seller"),
    subject: String(d.subject ?? "Conversation"),
    lastMessage: String(d.lastMessage ?? ""),
    lastAt: toMs(d.lastAt),
    customerUnread: Number(d.customerUnread ?? 0),
    sellerUnread: Number(d.sellerUnread ?? 0),
    createdAt: toMs(d.createdAt),
  };
}

function mapMessage(id: string, d: Record<string, unknown>): ConversationMessage {
  return {
    id,
    conversationId: String(d.conversationId ?? ""),
    from: d.from === "seller" ? "seller" : "customer",
    senderId: String(d.senderId ?? ""),
    body: String(d.body ?? ""),
    createdAt: toMs(d.createdAt),
  };
}

// ----------------------------------------------------------------
// List (one-shot) — for initial load / fallback
// ----------------------------------------------------------------

export async function listSellerConversations(sellerId: string): Promise<SellerConversation[]> {
  const snap = await getDocs(
    query(conversationsCol(), where("sellerId", "==", sellerId), orderBy("lastAt", "desc"), limit(100)),
  );
  return snap.docs.map((d) => mapConversation(d.id, d.data() as Record<string, unknown>));
}

export async function listCustomerConversations(customerId: string): Promise<SellerConversation[]> {
  const snap = await getDocs(
    query(conversationsCol(), where("customerId", "==", customerId), orderBy("lastAt", "desc"), limit(100)),
  );
  return snap.docs.map((d) => mapConversation(d.id, d.data() as Record<string, unknown>));
}

export async function listConversationMessages(convId: string): Promise<ConversationMessage[]> {
  const snap = await getDocs(
    query(convMsgCol(convId), orderBy("createdAt", "asc"), limit(500)),
  );
  return snap.docs.map((d) => mapMessage(d.id, d.data() as Record<string, unknown>));
}

// ----------------------------------------------------------------
// Realtime subscriptions
// ----------------------------------------------------------------

export function subscribeSellerConversations(
  sellerId: string,
  onResult: (conversations: SellerConversation[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(conversationsCol(), where("sellerId", "==", sellerId), orderBy("lastAt", "desc"), limit(100)),
    (snap) => {
      onResult(snap.docs.map((d) => mapConversation(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err),
  );
}

export function subscribeCustomerConversations(
  customerId: string,
  onResult: (conversations: SellerConversation[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(conversationsCol(), where("customerId", "==", customerId), orderBy("lastAt", "desc"), limit(100)),
    (snap) => {
      onResult(snap.docs.map((d) => mapConversation(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err),
  );
}

export function subscribeConversationMessages(
  convId: string,
  onResult: (messages: ConversationMessage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(convMsgCol(convId), orderBy("createdAt", "asc"), limit(500)),
    (snap) => {
      onResult(snap.docs.map((d) => mapMessage(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err),
  );
}

// ----------------------------------------------------------------
// Write operations
// ----------------------------------------------------------------

/**
 * Create a new conversation (called by customer when messaging a seller).
 * Uses a server function to write to the shared conversations collection
 * AND create a seller notification.
 *
 * Returns the conversation ID.
 */
export async function createSellerConversation(input: {
  idToken: string;
  sellerId: string;
  subject: string;
  firstMessage: string;
  threadId: string;
  customerName?: string;
  sellerShopName?: string;
}): Promise<string> {
  const result = await createConversation({
    data: {
      idToken: input.idToken,
      sellerId: input.sellerId,
      subject: input.subject,
      firstMessage: input.firstMessage,
      threadId: input.threadId,
      customerName: input.customerName,
      sellerShopName: input.sellerShopName,
    },
  });
  return result.conversationId;
}

/**
 * Customer sends a message in an existing conversation.
 * Writes directly to Firestore (customer owns the conversation as a participant).
 * Also writes to the customer's personal thread for backward compat.
 */
export async function customerSendMessage(
  convId: string,
  customerId: string,
  body: string,
  threadId?: string,
): Promise<void> {
  // Write to shared conversations collection (customer is a participant, can write)
  await setDoc(doc(convMsgCol(convId)), {
    conversationId: convId,
    from: "customer",
    senderId: customerId,
    body,
    createdAt: serverTimestamp(),
  });

  // Update conversation doc (both participants can update)
  await updateDoc(doc(getDb(), "conversations", convId), {
    lastMessage: body,
    lastAt: serverTimestamp(),
    sellerUnread: 1,
  });

  // Also update customer's personal thread for backward compat (if threadId provided)
  if (threadId) {
    await updateDoc(doc(getDb(), "users", customerId, "threads", threadId), {
      lastMessage: body,
      lastAt: serverTimestamp(),
    });
  }
}

/**
 * Seller sends a reply in a conversation.
 * Uses a server function because sellers can't write to customer's
 * personal collections (Firestore rules require isSelf).
 */
export async function sellerSendReply(
  convId: string,
  sellerId: string,
  idToken: string,
  customerId: string,
  body: string,
): Promise<void> {
  await sellerReply({
    data: {
      idToken,
      conversationId: convId,
      customerId,
      body,
    },
  });
}

/**
 * Seller marks a conversation as read (clears sellerUnread).
 */
export async function markSellerConversationRead(convId: string): Promise<void> {
  await updateDoc(doc(getDb(), "conversations", convId), {
    sellerUnread: 0,
  });
}

/**
 * Customer marks a conversation as read (clears customerUnread).
 */
export async function markCustomerConversationRead(convId: string): Promise<void> {
  await updateDoc(doc(getDb(), "conversations", convId), {
    customerUnread: 0,
  });
}

/**
 * Count unread conversations for a seller.
 */
export async function countSellerUnread(sellerId: string): Promise<number> {
  const snap = await getDocs(
    query(conversationsCol(), where("sellerId", "==", sellerId), where("sellerUnread", ">", 0), limit(50)),
  );
  return snap.size;
}


/**
 * Find a conversation by the customer's threadId.
 * Used by the customer ChatView to sync messages to the shared conversation.
 */
export async function findConversationByThreadId(customerId: string, threadId: string): Promise<SellerConversation | null> {
  const snap = await getDocs(
    query(conversationsCol(), where("customerId", "==", customerId), where("threadId", "==", threadId), limit(1)),
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapConversation(d.id, d.data() as Record<string, unknown>);
}
