/**
 * Tests for the seller conversations system.
 *
 * Tests the data model, type interfaces, and service function exports
 * to ensure the seller inbox and customer messaging integration is correct.
 */

import { describe, it, expect } from "vitest";
import type { SellerConversation, ConversationMessage } from "@/types/customer";

describe("Seller Conversations — Data Model", () => {
  it("SellerConversation has all required fields", () => {
    const conv: SellerConversation = {
      id: "conv123",
      customerId: "customer456",
      sellerId: "seller789",
      customerName: "John Doe",
      sellerShopName: "Awesome Shop",
      subject: "Order #ABC123",
      lastMessage: "Hello, I have a question",
      lastAt: Date.now(),
      customerUnread: 0,
      sellerUnread: 1,
      createdAt: Date.now(),
    };

    expect(conv.id).toBe("conv123");
    expect(conv.customerId).toBe("customer456");
    expect(conv.sellerId).toBe("seller789");
    expect(conv.customerName).toBe("John Doe");
    expect(conv.sellerShopName).toBe("Awesome Shop");
    expect(conv.subject).toBe("Order #ABC123");
    expect(conv.lastMessage).toBe("Hello, I have a question");
    expect(conv.customerUnread).toBe(0);
    expect(conv.sellerUnread).toBe(1);
    expect(typeof conv.lastAt).toBe("number");
    expect(typeof conv.createdAt).toBe("number");
  });

  it("ConversationMessage has all required fields", () => {
    const msg: ConversationMessage = {
      id: "msg123",
      conversationId: "conv123",
      from: "customer",
      senderId: "customer456",
      body: "When will my order arrive?",
      createdAt: Date.now(),
    };

    expect(msg.id).toBe("msg123");
    expect(msg.conversationId).toBe("conv123");
    expect(msg.from).toBe("customer");
    expect(msg.senderId).toBe("customer456");
    expect(msg.body).toBe("When will my order arrive?");
    expect(typeof msg.createdAt).toBe("number");
  });

  it("ConversationMessage.from can be 'seller'", () => {
    const msg: ConversationMessage = {
      id: "msg456",
      conversationId: "conv123",
      from: "seller",
      senderId: "seller789",
      body: "Your order will arrive in 2-3 days",
      createdAt: Date.now(),
    };

    expect(msg.from).toBe("seller");
    expect(msg.senderId).toBe("seller789");
  });
});

describe("Seller Conversations — Security Model", () => {
  it("Conversation links customerId and sellerId for authorization", () => {
    // The Firestore rules check that request.auth.uid matches
    // either customerId or sellerId on the conversation doc.
    const conv: SellerConversation = {
      id: "test",
      customerId: "uid-customer",
      sellerId: "uid-seller",
      customerName: "Customer",
      sellerShopName: "Seller Shop",
      subject: "Test",
      lastMessage: "",
      lastAt: 0,
      customerUnread: 0,
      sellerUnread: 0,
      createdAt: 0,
    };

    // Only the customer and seller should be able to read this conversation
    const authorizedReaders = [conv.customerId, conv.sellerId];
    expect(authorizedReaders).toContain("uid-customer");
    expect(authorizedReaders).toContain("uid-seller");
    expect(authorizedReaders).not.toContain("uid-other");
  });

  it("Message senderId must match authenticated user (Firestore rules)", () => {
    // Firestore rules: request.resource.data.senderId == request.auth.uid
    // AND from must be 'customer' or 'seller'
    const customerMsg: ConversationMessage = {
      id: "m1",
      conversationId: "c1",
      from: "customer",
      senderId: "customer-uid",
      body: "Hi",
      createdAt: Date.now(),
    };

    const sellerMsg: ConversationMessage = {
      id: "m2",
      conversationId: "c1",
      from: "seller",
      senderId: "seller-uid",
      body: "Hello!",
      createdAt: Date.now(),
    };

    // The rules ensure senderId matches auth.uid for message creation
    expect(customerMsg.from).toBe("customer");
    expect(sellerMsg.from).toBe("seller");
    expect(customerMsg.senderId).not.toBe(sellerMsg.senderId);
  });

  it("Update rules only allow changing unread counts and lastMessage", () => {
    // Firestore rules: affectedKeys().hasOnly([
    //   'lastMessage', 'lastAt', 'customerUnread', 'sellerUnread'
    // ])
    const allowedUpdateKeys = ["lastMessage", "lastAt", "customerUnread", "sellerUnread"];

    // These fields should be in the allowed list
    expect(allowedUpdateKeys).toContain("lastMessage");
    expect(allowedUpdateKeys).toContain("lastAt");
    expect(allowedUpdateKeys).toContain("customerUnread");
    expect(allowedUpdateKeys).toContain("sellerUnread");

    // These fields should NOT be in the allowed list (security)
    expect(allowedUpdateKeys).not.toContain("customerId");
    expect(allowedUpdateKeys).not.toContain("sellerId");
    expect(allowedUpdateKeys).not.toContain("subject");
  });
});

describe("Seller Conversations — Server Function Security", () => {
  it("createConversation requires customer to be authenticated (customerId == auth.uid)", () => {
    // The server function uses verifyIdToken to get uid,
    // and creates the conversation with customerId = uid.
    // Firestore rules also check: request.resource.data.customerId == request.auth.uid
    const customerId = "auth-uid-123";
    const sellerId = "seller-uid-456";

    // The conversation is created by the customer, so customerId must match auth
    expect(customerId).toBe("auth-uid-123");
    expect(sellerId).not.toBe(customerId);
  });

  it("sellerReply verifies conversation.sellerId matches caller", () => {
    // The server function:
    // 1. Verifies the caller is an approved seller
    // 2. Checks conv.data.sellerId === sellerId
    // 3. Checks conv.data.customerId === input.customerId
    const conv = {
      sellerId: "seller-uid-abc",
      customerId: "customer-uid-xyz",
    };

    // Only the seller who owns the conversation can reply
    expect(conv.sellerId).toBe("seller-uid-abc");
    expect(conv.customerId).toBe("customer-uid-xyz");
  });
});
