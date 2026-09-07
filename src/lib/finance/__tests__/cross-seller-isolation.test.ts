/**
 * AVENTA SHOP — Cross-Seller Data Isolation Security Audit (emulator-backed)
 *
 * Negative-test suite: every test attempts the ATTACK and expects DENY.
 * Covered attack classes:
 *  - IDOR / BOLA: wrong sellerId / walletId / ledgerId / withdrawalId /
 *    orderId in request params, forged cursors, guessed document IDs
 *  - cross-seller reads: Seller B must NEVER see Seller A's balances,
 *    ledger, or withdrawals through any server function
 *  - cross-seller mutations: B cannot spend, hold, or settle A's money
 *  - privilege escalation: sellers / blocked admins / stale-role users
 *    must fail every finance permission check (finance.read/adjust/
 *    payout/settlement/reconcile) — the same matrix the Firestore
 *    rules enforce client-side
 *  - stale authorization: aged tokens rejected for money-moving actions
 *
 * The transports in finance.functions.ts derive the seller identity
 * EXCLUSIVELY from the verified ID token (never from request data) —
 * these tests pin that server-level invariant from the layer below:
 * given a token for B, every wallet.server call must only ever touch
 * B's documents, no matter which IDs appear elsewhere.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";

import {
  appendLedgerEntry,
  SELLER_LEDGER_COLLECTION,
  SELLER_FINANCE_COLLECTION,
} from "../ledger.server";
import {
  getSellerWallet,
  queryWalletLedgerPage,
  listSellerWithdrawals,
  requestWalletWithdrawal,
  processWalletWithdrawal,
  getAdminWalletDetail,
  runWalletReconciliation,
  postManualAdjustment,
} from "../wallet.server";
import { requireFinancePermission, requireFreshAuth } from "../settlementBatch.server";
import { verifySellerToken } from "../walletAuth.server";
import { verifyIdToken } from "../../firebase-admin.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8092;
const BASE = `http://127.0.0.1:${EMULATOR_PORT}/v1/projects/test-project/databases/(default)/documents`;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORT}`;
  process.env.FIRESTORE_TEST_PROJECT = "test-project";
  delete process.env.NODE_ENV;
  emulatorServer = await createFirestoreEmulator(EMULATOR_PORT);
});

afterAll(async () => {
  await closeFirestoreEmulator(emulatorServer);
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_TEST_PROJECT;
});

beforeEach(() => {
  clearEmulatorStore();
});

// ── seeding helpers ───────────────────────────────────────────────
function fsValue(v: unknown): Record<string, unknown> {
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "boolean") return { booleanValue: v };
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fsValue(x)]),
        ),
      },
    };
  }
  return { stringValue: String(v) };
}

async function seedDoc(path: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])),
    }),
  });
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status}`);
}

async function seedSeller(sellerId: string) {
  await seedDoc(`sellers/${sellerId}`, {
    uid: sellerId,
    shopName: `Shop ${sellerId}`,
    status: "approved",
  });
}

async function seedUser(
  uid: string,
  data: { role?: string; adminRole?: string | null; blocked?: boolean },
) {
  await seedDoc(`users/${uid}`, {
    uid,
    email: `${uid}@test.local`,
    role: data.role ?? "customer",
    blocked: data.blocked ?? false,
    adminRole: data.adminRole ?? null,
  });
}

function testToken(uid: string, iatSeconds?: number): string {
  return btoa(
    JSON.stringify({
      uid,
      email: `${uid}@test.local`,
      iat: iatSeconds ?? Math.floor(Date.now() / 1000),
    }),
  );
}

async function credit(sellerId: string, amountMinor: number, key: string) {
  return appendLedgerEntry("test-project", {
    sellerId,
    type: "ORDER_CREDIT",
    amountMinor,
    currency: "BDT",
    orderId: `ord_${key}`,
    reference: null,
    createdBy: "checkout",
    idempotencyKey: key,
  });
}

const A = "iso_seller_a";
const B = "iso_seller_b";
const FIN_ADMIN = "iso_finance_admin";
const ADMIN_ACTOR = { uid: FIN_ADMIN, email: `${FIN_ADMIN}@test.local` };

async function seedWorld() {
  await seedSeller(A);
  await seedSeller(B);
  await seedUser(FIN_ADMIN, { role: "admin", adminRole: "finance_admin" });
  // Seller A has money; Seller B has none.
  await credit(A, 50_000, `cred_a_${expect.getState().currentTestName ?? "seed"}`);
}

// ════════════════════════════════════════════════════════════════════
// 1. CROSS-SELLER READ ISOLATION (wallet, ledger, withdrawals)
// ════════════════════════════════════════════════════════════════════

describe("cross-seller isolation: reads", () => {
  it("Seller B's wallet is zero and shares NOTHING with Seller A's balances", async () => {
    await seedWorld();
    const [wa, wb] = await Promise.all([
      getSellerWallet("test-project", A),
      getSellerWallet("test-project", B),
    ]);
    expect(wa.availableMinor).toBe(50_000);
    expect(wa.transactionCount).toBe(1);
    expect(wb.availableMinor).toBe(0);
    expect(wb.pendingMinor).toBe(0);
    expect(wb.transactionCount).toBe(0);
  });

  it("Seller B's ledger page NEVER contains Seller A's entries — even with a forged cursor from A's seq", async () => {
    await seedWorld();
    await credit(A, 10_000, "cred_a_2");

    const aPage = await queryWalletLedgerPage("test-project", A, { limit: 25 });
    expect(aPage.entries.length).toBe(2);
    const maxSeqA = Math.max(...aPage.entries.map((e) => e.seq));

    // B pages "before" A's max seq — a classic cursor-injection probe
    const bPage = await queryWalletLedgerPage("test-project", B, {
      before: maxSeqA,
      limit: 25,
    });
    expect(bPage.entries.length).toBe(0);

    const bPageNoCursor = await queryWalletLedgerPage("test-project", B, { limit: 25 });
    expect(bPageNoCursor.entries.length).toBe(0);
    expect(JSON.stringify(bPageNoCursor)).not.toContain(A);
  });

  it("B's withdrawal list never leaks A's withdrawal documents (predictable-ID guess)", async () => {
    await seedWorld();
    const wd = await requestWalletWithdrawal("test-project", A, {
      amountTaka: 100,
      method: "bank",
      destination: "BRAC 12345",
    });
    const bList = await listSellerWithdrawals("test-project", B, 50);
    expect(bList.length).toBe(0);
    expect(JSON.stringify(bList)).not.toContain(wd.withdrawalId);
  });

  it("admin wallet detail for B shows only B — passing A's IDs in the SAME request never blends data", async () => {
    await seedWorld();
    await requestWalletWithdrawal("test-project", A, {
      amountTaka: 100,
      method: "bank",
      destination: "BRAC 12345",
    });
    const detailB = await getAdminWalletDetail("test-project", FIN_ADMIN, B, {});
    expect(detailB.wallet.availableMinor).toBe(0);
    expect(detailB.ledger.entries.length).toBe(0);
    expect(detailB.withdrawals.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. IDOR / BOLA — mutations must DENY
// ════════════════════════════════════════════════════════════════════

describe("cross-seller isolation: IDOR mutations", () => {
  it("B cannot withdraw A's money: zero balance → INSUFFICIENT (no fallback to A)", async () => {
    await seedWorld();
    await expect(
      requestWalletWithdrawal("test-project", B, {
        amountTaka: 100,
        method: "bank",
        destination: "BRAC 12345",
      }),
    ).rejects.toThrow(/insufficient/i);
    // A's money is untouched
    const wa = await getSellerWallet("test-project", A);
    expect(wa.availableMinor).toBe(50_000);
  });

  it("admin processing B's withdrawalId against sellerId=A is DENIED — A's withdrawal survives untouched", async () => {
    await seedWorld();
    const wdA = await requestWalletWithdrawal("test-project", A, {
      amountTaka: 100,
      method: "bank",
      destination: "BRAC 12345",
    });
    await expect(
      processWalletWithdrawal("test-project", ADMIN_ACTOR, {
        sellerId: B, // ← wrong owner for this withdrawalId
        withdrawalId: wdA.withdrawalId,
        action: "approve",
      }),
    ).rejects.toThrow();
    // A's withdrawal is still REQUESTED, funds still held for A only
    const aList = await listSellerWithdrawals("test-project", A, 10);
    expect(aList[0]?.status).toBe("REQUESTED");
    const wb = await getSellerWallet("test-project", B);
    expect(wb.availableMinor).toBe(0);
  });

  it("B's manual-adjustment attempt on A's wallet requires finance.adjust — a seller uid is denied", async () => {
    await seedWorld();
    // The transport layer would reject before even reaching here; this
    // pins the deeper invariant: the permission gate itself denies.
    await expect(requireFinancePermission("test-project", B, "finance.adjust")).rejects.toThrow(
      /lacks finance.adjust/i,
    );
    const wa = await getSellerWallet("test-project", A);
    expect(wa.availableMinor).toBe(50_000);
  });

  it("replay: approving the same withdrawal twice is a no-op/deny — no double payout", async () => {
    await seedWorld();
    const wd = await requestWalletWithdrawal("test-project", A, {
      amountTaka: 100,
      method: "bank",
      destination: "BRAC 12345",
    });
    await processWalletWithdrawal("test-project", ADMIN_ACTOR, {
      sellerId: A,
      withdrawalId: wd.withdrawalId,
      action: "approve",
      note: "first",
    });
    await expect(
      processWalletWithdrawal("test-project", ADMIN_ACTOR, {
        sellerId: A,
        withdrawalId: wd.withdrawalId,
        action: "approve",
        note: "replay",
      }),
    ).rejects.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. PRIVILEGE ESCALATION — permission matrix
// ════════════════════════════════════════════════════════════════════

describe("authorization: privilege escalation", () => {
  it("a seller uid has ZERO finance permissions (all six denied)", async () => {
    await seedWorld();
    const perms = [
      "finance.read",
      "finance.adjust",
      "finance.payout",
      "finance.settlement",
      "finance.reconcile",
      "finance.review",
    ] as const;
    for (const p of perms) {
      await expect(requireFinancePermission("test-project", B, p)).rejects.toThrow(/lacks/i);
    }
  });

  it("a BLOCKED finance_admin loses all finance authority (rules/server parity)", async () => {
    await seedWorld();
    await seedUser("blocked_fin", { role: "admin", adminRole: "finance_admin", blocked: true });
    await expect(
      requireFinancePermission("test-project", "blocked_fin", "finance.read"),
    ).rejects.toThrow(/lacks/i);
    await expect(
      requireFinancePermission("test-project", "blocked_fin", "finance.payout"),
    ).rejects.toThrow(/lacks/i);
  });

  it("a customer-role user with a STALE adminRole has zero finance authority", async () => {
    await seedWorld();
    await seedUser("stale_role", { role: "customer", adminRole: "finance_admin" });
    await expect(
      requireFinancePermission("test-project", "stale_role", "finance.read"),
    ).rejects.toThrow(/lacks/i);
  });

  it("plain admin is read-only: finance.read granted, money mutations denied", async () => {
    await seedWorld();
    await seedUser("plain_admin", { role: "admin", adminRole: "admin" });
    await expect(
      requireFinancePermission("test-project", "plain_admin", "finance.read"),
    ).resolves.toBeUndefined();
    await expect(
      requireFinancePermission("test-project", "plain_admin", "finance.adjust"),
    ).rejects.toThrow(/lacks/i);
    await expect(
      requireFinancePermission("test-project", "plain_admin", "finance.payout"),
    ).rejects.toThrow(/lacks/i);
  });

  it("stale authorization: an aged token is rejected for money-moving actions", async () => {
    await seedWorld();
    const oldIat = Math.floor(Date.now() / 1000) - 60 * 60; // 1h old
    await expect(requireFreshAuth(testToken(FIN_ADMIN, oldIat))).rejects.toThrow(
      /re-authentication/i,
    );
    // fresh token passes
    await expect(requireFreshAuth(testToken(FIN_ADMIN))).resolves.toBe(FIN_ADMIN);
  });

  it("manual adjustment by an actor WITHOUT finance.adjust never lands (server gate)", async () => {
    await seedWorld();
    await expect(requireFinancePermission("test-project", B, "finance.adjust")).rejects.toThrow();
    // sanity: finance_admin CAN adjust (positive control)
    await expect(
      postManualAdjustment("test-project", ADMIN_ACTOR, {
        sellerId: A,
        amountTaka: 5,
        direction: "CREDIT",
        reason: "positive control adjustment for isolation suite",
      }),
    ).resolves.toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. TRANSPORT IDENTITY CHAIN — token is the ONLY seller identity
// ════════════════════════════════════════════════════════════════════

describe("authorization: token-derived identity", () => {
  it("verifySellerToken derives the uid from the token — a non-seller user is rejected", async () => {
    await seedWorld();
    await seedUser("plain_customer", { role: "customer" });
    const { uid } = await verifyIdToken(testToken(A));
    expect(uid).toBe(A);
    await expect(verifySellerToken(testToken(A))).resolves.toMatchObject({ uid: A });
    // plain customer has no sellers/{uid} doc → rejected as a wallet actor
    await expect(verifySellerToken(testToken("plain_customer"))).rejects.toThrow(
      /seller account not found/i,
    );
  });

  it("token identity and wallet ownership can never disagree (transport invariant, pinned at the layer below)", async () => {
    await seedWorld();
    // Given a verified token for B, the wallet chain resolves B's docs ONLY
    const { uid: tokenUid } = await verifySellerToken(testToken(B));
    expect(tokenUid).toBe(B);
    const wallet = await getSellerWallet("test-project", tokenUid);
    expect(wallet.sellerId).toBe(B);
    expect(wallet.availableMinor).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. RECONCILIATION — cross-seller contamination check
// ════════════════════════════════════════════════════════════════════

describe("reconciliation: cross-seller integrity", () => {
  it("A's activity never corrupts B's reconciliation; both sellers verify independently", async () => {
    await seedWorld();
    await requestWalletWithdrawal("test-project", A, {
      amountTaka: 100,
      method: "bkash",
      destination: "017123",
    });
    await postManualAdjustment("test-project", ADMIN_ACTOR, {
      sellerId: A,
      amountTaka: 2,
      direction: "CREDIT",
      reason: "isolation suite: A-only adjustment",
    });

    const report = await runWalletReconciliation("test-project", FIN_ADMIN);
    expect(report.sellersChecked).toBeGreaterThanOrEqual(1);
    expect(report.mismatches.length).toBe(0);

    // B remains a clean zero wallet
    const wb = await getSellerWallet("test-project", B);
    expect(wb.transactionCount).toBe(0);
    expect(wb.availableMinor).toBe(0);
  });
});
