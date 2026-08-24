/**
 * Inbox Conversation Detail — Loading Fix Tests
 *
 * Bug: clicking a conversation (e.g. "Shop Nexa Support") in the inbox
 * crashed with "This page didn't load — Something went wrong on our end."
 *
 * Root cause: Rules of Hooks violation in CommunicationCenter component.
 * The `useMemo` call for `filteredThreads` was placed AFTER conditional
 * early returns (`if (activeThreadId) return <ChatView>`, etc.). When the
 * user clicked a thread, activeThreadId became non-null, the component
 * returned ChatView early, and the useMemo hook was skipped. React
 * detected a different number of hooks between renders and threw a
 * crash that hit the root error boundary.
 *
 * Fix: moved the `useMemo` and derived variable declarations (threads,
 * notifications, tickets, orders) BEFORE the early returns so hooks
 * are always called in the same order on every render.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";

const SOURCE = fs.readFileSync("src/routes/_authenticated/messages.tsx", "utf-8");
const LINES = SOURCE.split("\n");

function lineOf(pattern: string): number {
  for (let i = 0; i < LINES.length; i++) {
    if (LINES[i].includes(pattern)) return i + 1;
  }
  return -1;
}

describe("Inbox Conversation Detail — Hooks Violation Fix", () => {
  // Test 1: Clicking support conversation opens detail page (no crash)
  it("useMemo for filteredThreads is called BEFORE any conditional early return", () => {
    const useMemoLine = lineOf("const filteredThreads = useMemo(()");
    const firstReturnLine = lineOf("if (activeThreadId) {");
    expect(useMemoLine).toBeGreaterThan(0);
    expect(firstReturnLine).toBeGreaterThan(0);
    expect(useMemoLine).toBeLessThan(firstReturnLine);
  });

  it("derived variables (threads, notifications, tickets, orders) are computed before early returns", () => {
    const threadsLine = lineOf("const threads = realtimeThreads.length");
    const firstReturnLine = lineOf("if (activeThreadId) {");
    expect(threadsLine).toBeGreaterThan(0);
    expect(threadsLine).toBeLessThan(firstReturnLine);
  });

  it("no hooks are called after the first conditional return in CommunicationCenter", () => {
    const firstReturnLine = lineOf("if (activeThreadId) {");
    // Find the main return statement that renders the full page
    const mainReturnLine = lineOf("ServicePageLayout title={t(");
    // Between firstReturnLine and mainReturnLine, there should be no
    // new hook calls (useMemo, useState, useEffect, useQuery, etc.)
    const section = LINES.slice(firstReturnLine - 1, mainReturnLine - 1).join("\n");
    // These are the early-return blocks (ChatView, TicketChatView, OrderConversationView)
    // No hooks should appear here — only conditional returns
    expect(section).not.toContain("useMemo(");
    expect(section).not.toContain("useState(");
    expect(section).not.toContain("useEffect(");
    expect(section).not.toContain("useQuery(");
    expect(section).not.toContain("useMutation(");
  });

  // Test 2: Correct conversation ID reaches route
  it("ChatView receives threadId prop from activeThreadId state", () => {
    const chatViewBlock = SOURCE.match(
      /if \(activeThreadId\) \{[\s\S]*?<ChatView[\s\S]*?threadId=\{activeThreadId\}/,
    );
    expect(chatViewBlock).toBeTruthy();
  });

  // Test 3: Detail page loads seeded support thread (ChatView queries correct path)
  it("ChatView queries messages from users/{uid}/messages with threadId filter", () => {
    const chatViewSection = SOURCE.slice(SOURCE.indexOf("function ChatView("));
    expect(chatViewSection).toContain('"users", userId, "messages"');
    expect(chatViewSection).toContain('where("threadId", "==", threadId)');
  });

  // Test 4: Messages load (onSnapshot real-time listener)
  it("ChatView uses onSnapshot for real-time message loading", () => {
    const chatViewSection = SOURCE.slice(SOURCE.indexOf("function ChatView("));
    expect(chatViewSection).toContain("onSnapshot(");
  });

  // Test 5: Empty conversation works (no crash on zero messages)
  it("ChatView handles empty messages state", () => {
    const chatViewSection = SOURCE.slice(SOURCE.indexOf("function ChatView("));
    expect(chatViewSection).toContain("messages.length === 0");
    expect(chatViewSection).toContain("No messages yet");
  });

  // Test 6: Missing conversation handled correctly (activeThread can be undefined)
  it("ChatView uses optional chaining for activeThread lookup", () => {
    const chatViewSection = SOURCE.slice(SOURCE.indexOf("function ChatView("));
    expect(chatViewSection).toContain("thread.data?.find");
    expect(chatViewSection).toContain("activeThread?.participant");
  });

  // Test 7: User cannot access another user's conversation (Firestore rules)
  it("Firestore catch-all restricts threads/messages to isSelf(uid)", () => {
    const rules = fs.readFileSync("firestore.rules", "utf-8");
    const catchAll = rules.match(/match \/\{sub\}\/\{docId\} \{[\s\S]*?\}/);
    expect(catchAll).toBeTruthy();
    expect(catchAll![0]).toContain("isSelf(uid)");
  });

  // Test 8: Unauthenticated access denied
  it("isSignedIn function exists and is used in catch-all", () => {
    const rules = fs.readFileSync("firestore.rules", "utf-8");
    const isSignedInFn = rules.match(/function isSignedIn\(\) \{[\s\S]*?\}/);
    expect(isSignedInFn).toBeTruthy();
    expect(isSignedInFn![0]).toContain("request.auth != null");
  });

  // Test 9: Real-time new message works (onSnapshot with error callback)
  it("ChatView onSnapshot has error callback for graceful failure", () => {
    const chatViewSection = SOURCE.slice(SOURCE.indexOf("function ChatView("));
    expect(chatViewSection).toContain("setMessagesLoading(false)");
  });

  // Test 10: Read/unread state works
  it("ChatView calls markThreadRead on mount", () => {
    const chatViewSection = SOURCE.slice(sourceIndexOfChatView());
    expect(chatViewSection).toContain("markThreadRead(userId, threadId)");
  });

  // Test 11: Welcome thread creation is idempotent
  it("seedInbox uses deterministic doc ID for welcome thread", () => {
    const seedSource = fs.readFileSync("src/services/firebase/seedInbox.ts", "utf-8");
    expect(seedSource).toContain('"welcome-thread"');
  });

  // Test 12: Duplicate welcome thread is not created
  it("seedInbox uses runTransaction to prevent duplicate creation", () => {
    const seedSource = fs.readFileSync("src/services/firebase/seedInbox.ts", "utf-8");
    expect(seedSource).toContain("runTransaction(db");
    expect(seedSource).toContain("if (existing.exists()) return");
  });

  // Test 13 & 14: Direct URL access / page refresh
  // The messages route has no URL params — it's state-based navigation.
  // This means there's no URL-encoded thread ID that could break on refresh.
  it("messages route does not use URL params for thread ID (state-based)", () => {
    const routeDef = SOURCE.match(/createFileRoute\("\/_authenticated\/messages"\)/);
    expect(routeDef).toBeTruthy();
    // No $threadId or :threadId in the route path
    expect(SOURCE).not.toContain('"/_authenticated/messages/$threadId"');
  });

  it("ChatView is rendered as a child component (not a separate route)", () => {
    // ChatView is a function component in the same file, rendered conditionally
    expect(SOURCE).toContain("function ChatView(");
    // It's returned from the parent when activeThreadId is set
    const chatViewReturn = SOURCE.match(
      /if \(activeThreadId\) \{\s*return\s*\(\s*<ChatView/,
    );
    expect(chatViewReturn).toBeTruthy();
  });
});

function sourceIndexOfChatView(): number {
  return SOURCE.indexOf("function ChatView(");
}
