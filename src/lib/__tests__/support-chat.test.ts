import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizeChatText } from "../support-chat.server";

const read = (p: string) => readFileSync(p, "utf8");

describe("Customer support chat", () => {
  it("sanitizeChatText strips control chars, collapses whitespace, caps 1000", () => {
    expect(sanitizeChatText("  hello   world  ")).toBe("hello world");
    expect(sanitizeChatText("line1\n\n\nline2")).toBe("line1\n\nline2");
    expect(sanitizeChatText("bad\u0007control\u0000chars")).toBe("badcontrolchars");
    expect(sanitizeChatText("x".repeat(1500)).length).toBe(1000);
    expect(sanitizeChatText("   \n  ")).toBe("");
  });

  it("server core: service-role only, no client SDK imports, token-verified", () => {
    const src = read("src/lib/support-chat.server.ts");
    expect(src).toMatch(/verifyIdToken/);
    expect(src).not.toMatch(/from ["']firebase\/(firestore|app)["']/);
    // uid derived from token, never accepted from client
    expect(src).not.toMatch(/chatId.*z\.string/);
    // atomic message+thread write
    expect(src).toMatch(/commitWrites/);
    expect(src).toMatch(/updateMask/);
  });

  it("client service: zero client Firestore writes (deny-all rules intact)", () => {
    const src = read("src/services/support/supportChat.ts");
    expect(/setDoc|updateDoc|addDoc|deleteDoc/.test(src)).toBe(false);
  });

  it("widget component exists and is mounted in the root route", () => {
    expect(read("src/components/support/SupportChatWidget.tsx")).toMatch(/AVENTA/);
    expect(read("src/routes/__root.tsx")).toMatch(/SupportChatWidget/);
  });
});
