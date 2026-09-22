import { describe, it, expect, beforeEach, afterAll } from "vitest";

// This module runs in the browser only; the vitest environment here is plain
// Node (no jsdom dependency in this repo), so we stub a minimal `window`
// with a real in-memory Storage-like object before importing the module.
class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
}

const fakeWindow = { localStorage: new FakeStorage() };
const previousWindow = (globalThis as { window?: unknown }).window;
(globalThis as { window?: unknown }).window = fakeWindow;

afterAll(() => {
  (globalThis as { window?: unknown }).window = previousWindow;
});

const { isSellerModeActive, activateSellerMode, deactivateSellerMode } =
  await import("../sellerMode");

describe("sellerMode persistence (Seller Mode lock)", () => {
  beforeEach(() => {
    fakeWindow.localStorage.clear();
  });

  it("is inactive by default for any uid", () => {
    expect(isSellerModeActive("seller-1")).toBe(false);
  });

  it("returns false for a missing/undefined uid without touching storage", () => {
    expect(isSellerModeActive(undefined)).toBe(false);
    expect(isSellerModeActive(null)).toBe(false);
    activateSellerMode(undefined);
    activateSellerMode(null);
    expect(fakeWindow.localStorage.length).toBe(0);
  });

  it("activates and persists the flag for a specific uid", () => {
    activateSellerMode("seller-1");
    expect(isSellerModeActive("seller-1")).toBe(true);
  });

  it("scopes the flag per uid — activating one account never leaks to another", () => {
    activateSellerMode("seller-1");
    expect(isSellerModeActive("seller-2")).toBe(false);
  });

  it("only the explicit deactivate call clears the lock", () => {
    activateSellerMode("seller-1");
    expect(isSellerModeActive("seller-1")).toBe(true);
    deactivateSellerMode("seller-1");
    expect(isSellerModeActive("seller-1")).toBe(false);
  });

  it("survives being read again later (simulating a full browser close/reopen)", () => {
    activateSellerMode("seller-9");
    // Re-read fresh, exactly as a brand-new page load / SellerModeGuard mount would.
    expect(isSellerModeActive("seller-9")).toBe(true);
  });
});
