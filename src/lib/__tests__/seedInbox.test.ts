/**
 * seedInbox Race-Condition Fix Tests
 *
 * Bug: the customer inbox showed two duplicate "AVENTA SHOP Support" welcome
 * conversations. Root cause: seedInbox() checked "does any thread exist?"
 * then created a new auto-ID thread — a classic check-then-act race. If the
 * effect ran twice before the first write settled (remount, double effect,
 * multiple tabs), both calls saw "no threads yet" and both created one.
 *
 * Fix: deterministic doc IDs + a Firestore transaction so only one call can
 * ever win the creation, plus a self-heal pass that collapses any duplicate
 * welcome threads left over from before the fix.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";

const SOURCE = fs.readFileSync("src/services/firebase/seedInbox.ts", "utf-8");

describe("seedInbox — race condition fix", () => {
  it("uses a deterministic doc ID for the welcome thread (no more auto-ID races)", () => {
    expect(SOURCE).toContain('doc(threadsCol, "welcome-thread")');
  });

  it("uses deterministic doc IDs for the welcome message and system notification", () => {
    expect(SOURCE).toContain('"welcome-msg"');
    expect(SOURCE).toContain('"welcome-notif"');
  });

  it("wraps the seed writes in a Firestore transaction for atomicity", () => {
    expect(SOURCE).toContain("runTransaction(db");
    expect(SOURCE).toContain("tx.get(threadRef)");
    expect(SOURCE).toContain("existing.exists()");
  });

  it("aborts the transaction early if the thread already exists (prevents duplicate creation)", () => {
    const txBlock = SOURCE.match(/runTransaction\(db, async \(tx\) => \{[\s\S]*?\}\);/);
    expect(txBlock).toBeTruthy();
    expect(txBlock![0]).toContain("if (existing.exists()) return;");
  });

  it("self-heals pre-existing duplicate welcome threads by keeping only the oldest", () => {
    expect(SOURCE).toContain("dupSnap.size > 1");
    expect(SOURCE).toContain("deleteDoc");
    // Keeps the oldest (sorted ascending by createdAt, drops everything after index 0)
    expect(SOURCE).toContain("sorted");
    expect(SOURCE).toContain("duplicates.map((d) => deleteDoc(d.ref))");
  });

  it("dedupe query filters by both participant and subject (won't touch real conversations)", () => {
    expect(SOURCE).toContain('where("participant", "==", WELCOME_PARTICIPANT)');
    expect(SOURCE).toContain('where("subject", "==", WELCOME_SUBJECT)');
  });

  it("still skips seeding entirely once the user has any real thread", () => {
    expect(SOURCE).toContain("anyThreadSnap.empty");
  });

  it("welcome content constants are unchanged (no visual/behavioral regression)", () => {
    expect(SOURCE).toContain('const WELCOME_SUBJECT = "Welcome to AVENTA SHOP!"');
    expect(SOURCE).toContain('const WELCOME_PARTICIPANT = "AVENTA SHOP Support"');
    expect(SOURCE).toContain(
      "Hi! Welcome to AVENTA SHOP. We're here to help with anything you need. Feel free to ask questions about orders, products, or your account.",
    );
  });

  it("does NOT create fake '100 Bonus Points' or 'WELCOME10' notifications", () => {
    expect(SOURCE).not.toContain("100 Bonus Points");
    expect(SOURCE).not.toContain("WELCOME10");
  });

  it("does NOT create 'reward-notif' or 'promo-notif' as new notifications", () => {
    // These old cosmetic IDs should only appear in the self-heal cleanup,
    // never in a tx.set() call for creating notifications.
    const setMatches = SOURCE.match(/tx\.set\([^)]+\)/g) ?? [];
    for (const setCall of setMatches) {
      expect(setCall).not.toContain("reward-notif");
      expect(setCall).not.toContain("promo-notif");
    }
  });

  it("self-heals old cosmetic 'reward-notif' and 'promo-notif' notifications", () => {
    expect(SOURCE).toContain('"reward-notif"');
    expect(SOURCE).toContain('"promo-notif"');
    expect(SOURCE).toContain("deleteDoc");
  });

  it("welcome system notification content is preserved", () => {
    expect(SOURCE).toContain("Welcome to AVENTA SHOP! 🎉");
  });
});
