/**
 * Seller Messages Server Functions
 *
 * Handles cross-user writes for seller → customer messaging.
 * The seller cannot write to the customer's Firestore collections
 * (Firestore rules require isSelf), so these server functions
 * use the Admin SDK (Firestore REST API) to:
 * 1. Write seller replies into the customer's messages collection
 * 2. Update the customer's thread (lastMessage, unread, lastAt)
 * 3. Write to the shared conversations collection (for seller-side read)
 * 4. Create a notification for the customer
 *
 * Security: Verifies the caller is an approved seller via verifyIdToken,
 * then checks that the thread/conversation belongs to that seller.
 */

import {
  verifyIdToken,
  getProjectId,
  docPath,
  commitWrites,
  toFsValue,
  toFsFields,
  newDocId,
  batchGetDocs,
  type FsWrite,
} from "./firebase-admin.server";

/**
 * Verify that the caller is an approved seller and return their uid.
 */
async function verifyApprovedSeller(idToken: string): Promise<string> {
  const { uid } = await verifyIdToken(idToken);

  // Check seller profile exists and is approved
  const projectId = getProjectId();
  const sellerDoc = await batchGetDocs(projectId, [docPath(projectId, ["sellers", uid])]);
  const seller = sellerDoc.get(docPath(projectId, ["sellers", uid]));
  if (!seller || !seller.exists) {
    throw new Error("Seller profile not found. Please register as a seller.");
  }
  if (seller.data.status !== "approved") {
    throw new Error("Your seller account is not approved.");
  }
  return uid;
}

/**
 * Seller sends a reply to a customer's conversation.
 *
 * @param idToken - Seller's Firebase ID token (for auth verification)
 * @param input  - { conversationId, customerId, body }
 *
 * Writes to:
 * 1. conversations/{convId}/messages/{msgId} — from: "seller"
 * 2. conversations/{convId} — lastMessage, lastAt, customerUnread=1, sellerUnread=0
 * 3. users/{customerId}/messages/{msgId} — from: "support" (customer sees it)
 * 4. users/{customerId}/threads/{threadId} — lastMessage, unread=1, lastAt
 * 5. users/{customerId}/notifications/{notifId} — notification for customer
 *
 * Verifies the conversation's sellerId matches the caller.
 */
export async function sellerReplyServer(
  idToken: string,
  input: { conversationId: string; customerId: string; body: string },
): Promise<void> {
  const sellerId = await verifyApprovedSeller(idToken);

  if (!input.body.trim()) throw new Error("Message body cannot be empty.");
  if (input.body.length > 5000) throw new Error("Message is too long (max 5000 chars).");

  const projectId = getProjectId();

  // 1. Verify the conversation exists and belongs to this seller
  const convPath = docPath(projectId, ["conversations", input.conversationId]);
  const convDoc = await batchGetDocs(projectId, [convPath]);
  const conv = convDoc.get(convPath);
  if (!conv || !conv.exists) {
    throw new Error("Conversation not found.");
  }
  if (conv.data.sellerId !== sellerId) {
    throw new Error("Access denied: this conversation does not belong to you.");
  }
  if (conv.data.customerId !== input.customerId) {
    throw new Error("Customer ID mismatch.");
  }

  // Get the threadId from the conversation (stored when created)
  const threadId = (conv.data.threadId as string) ?? conv.data.customerThreadId ?? "";
  if (!threadId) {
    throw new Error("Conversation thread not found.");
  }

  const body = input.body.trim();
  const msgId = newDocId();
  const notifId = newDocId();

  // Build writes array
  const writes: FsWrite[] = [
    // 1. Write message to conversations collection (seller reads from here)
    {
      update: {
        name: docPath(projectId, ["conversations", input.conversationId, "messages", msgId]),
        fields: toFsFields({
          conversationId: input.conversationId,
          from: "seller",
          senderId: sellerId,
          body,
          createdAt: { ".sv": "timestamp" },
        }),
      },
    },
    // 2. Update conversation doc
    {
      update: {
        name: convPath,
        fields: toFsFields({
          lastMessage: body,
          customerUnread: 1,
          sellerUnread: 0,
        }),
      },
      updateMask: { fieldPaths: ["lastMessage", "customerUnread", "sellerUnread"] },
    },
    // 3. Update conversation lastAt with serverTimestamp via transform
    {
      transform: {
        document: convPath,
        fieldTransforms: [{ fieldPath: "lastAt", setToServerValue: "REQUEST_TIME" }],
      },
    },
    // 4. Write message to customer's messages collection (customer sees it)
    {
      update: {
        name: docPath(projectId, ["users", input.customerId, "messages", msgId]),
        fields: toFsFields({
          threadId,
          body,
          from: "support",
          createdAt: { ".sv": "timestamp" },
        }),
      },
    },
    // 5. Update customer's thread
    {
      update: {
        name: docPath(projectId, ["users", input.customerId, "threads", threadId]),
        fields: toFsFields({
          lastMessage: body,
          unread: 1,
        }),
      },
      updateMask: { fieldPaths: ["lastMessage", "unread"] },
    },
    // 6. Transform customer's thread lastAt
    {
      transform: {
        document: docPath(projectId, ["users", input.customerId, "threads", threadId]),
        fieldTransforms: [{ fieldPath: "lastAt", setToServerValue: "REQUEST_TIME" }],
      },
    },
    // 7. Create notification for customer
    {
      update: {
        name: docPath(projectId, ["users", input.customerId, "notifications", notifId]),
        fields: toFsFields({
          type: "support",
          title: "New reply from seller",
          message: body.slice(0, 100),
          link: "/messages",
          read: false,
          createdAt: { ".sv": "timestamp" },
        }),
      },
    },
  ];

  await commitWrites(projectId, writes);
}

/**
 * Customer creates a new conversation with a seller.
 * Called from the server when customer starts a seller chat.
 *
 * @param idToken - Customer's Firebase ID token
 * @param input   - { sellerId, subject, firstMessage, threadId }
 *
 * Writes to:
 * 1. conversations/{convId} — new conversation doc
 * 2. conversations/{convId}/messages/{msgId} — first message
 * 3. sellers/{sellerId}/notifications/{notifId} — notify seller
 */
export async function createConversationServer(
  idToken: string,
  input: {
    sellerId: string;
    subject: string;
    firstMessage: string;
    threadId: string;
    customerName?: string;
    sellerShopName?: string;
  },
): Promise<string> {
  const { uid: customerId } = await verifyIdToken(idToken);

  if (!input.firstMessage.trim()) throw new Error("Message body cannot be empty.");
  if (input.firstMessage.length > 5000) throw new Error("Message is too long.");
  if (!input.sellerId) throw new Error("Seller ID is required.");
  if (!input.threadId) throw new Error("Thread ID is required.");

  const projectId = getProjectId();
  const convId = newDocId();
  const msgId = newDocId();
  const notifId = newDocId();

  const writes: FsWrite[] = [
    // 1. Create conversation doc
    {
      update: {
        name: docPath(projectId, ["conversations", convId]),
        fields: toFsFields({
          customerId,
          sellerId: input.sellerId,
          customerName: input.customerName ?? "Customer",
          sellerShopName: input.sellerShopName ?? "Seller",
          subject: input.subject,
          lastMessage: input.firstMessage.trim(),
          customerUnread: 0,
          sellerUnread: 1,
          threadId: input.threadId,
          createdAt: { ".sv": "timestamp" },
        }),
      },
    },
    // 2. Set lastAt via transform
    {
      transform: {
        document: docPath(projectId, ["conversations", convId]),
        fieldTransforms: [{ fieldPath: "lastAt", setToServerValue: "REQUEST_TIME" }],
      },
    },
    // 3. Create first message in conversations collection
    {
      update: {
        name: docPath(projectId, ["conversations", convId, "messages", msgId]),
        fields: toFsFields({
          conversationId: convId,
          from: "customer",
          senderId: customerId,
          body: input.firstMessage.trim(),
          createdAt: { ".sv": "timestamp" },
        }),
      },
    },
    // 4. Create seller notification
    {
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, "notifications", notifId]),
        fields: toFsFields({
          type: "admin_message",
          title: "New customer message",
          message: input.firstMessage.trim().slice(0, 100),
          link: "/seller/messages",
          read: false,
          createdAt: { ".sv": "timestamp" },
        }),
      },
    },
  ];

  await commitWrites(projectId, writes);
  return convId;
}
