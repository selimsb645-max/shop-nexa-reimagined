/**
 * AVENTA SHOP — Seller Wallet & Transaction Ledger tests (emulator-backed)
 *
 * Covers the Wallet spec end-to-end:
 *  - wallet creation / defaults / retrieval / status
 *  - credit / debit / duplicate (idempotency) / invalid amounts
 *  - immutable ledger + atomic wallet+entry writes
 *  - negative balance protection (incl. CONCURRENCY — two parallel
 *    debits can never overdraw)
 *  - withdrawal lifecycle: request → hold → approve → payout /
 *    reject → release (idempotent ledger keys)
 *  - wallet status lifecycle (SUSPENDED blocks withdrawals, CLOSED terminal)
 *  - manual adjustments (reason mandatory, permission-gated, audit-logged)
 *  - seller isolation + role-based finance permissions
 *  - reconciliation: ledger replay === stored balances; tamper detection
 *  - legacy walletTx migration (idempotent, integer conversion)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  createFirestoreEmulator,
  clearEmulatorStore,
  closeFirestoreEmulator,
} from "../../__tests__/firestore-emulator";

import { appendLedgerEntry, getSellerBalances, verifyLedgerIntegrity, SELLER_LEDGER_COLLECTION, SELLER_FINANCE_COLLECTION } from "../ledger.server";
import {
  getSellerWallet,
  requestWalletWithdrawal,
  processWalletWithdrawal,
  postManualAdjustment,
  setWalletStatus,
  listAdminWallets,
  getAdminWalletDetail,
  runWalletReconciliation,
  migrateLegacyWalletTx,
  queryWalletLedgerPage,
} from "../wallet.server";
import { requireFinancePermission, requireFreshAuth } from "../settlementBatch.server";
import { querySellerLedger } from "../reconcile.server";

let emulatorServer: Server;
const EMULATOR_PORT = 8091;
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

// ── seeding helpers (same shape as finance.server.test.ts) ────────
function fsValue(v: unknown): Record<string, unknown> {
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "boolean") return { booleanValue: v };
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fsValue(x)])) } };
  }
  return { stringValue: String(v) };
}

async function seedDoc(path: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }),
  });
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status}`);
}

async function seedSeller(sellerId: string) {
  await seedDoc(`sellers/${sellerId}`, { uid: sellerId, shopName: `Shop ${sellerId}`, status: "approved" });
}
async function seedAdmin(uid: string, adminRole: string | null) {
  await seedDoc(`users/${uid}`, { uid, email: `${uid}@test.local`, adminRole });
}

/** Test (emulator-mode) ID token: base64 JSON, per firebase-admin.server. */
function testToken(uid: string, iatSeconds?: number): string {
  return btoa(JSON.stringify({ uid, email: `${uid}@test.local`, iat: iatSeconds ?? Math.floor(Date.now() / 1000) }));
}

const SELLER = "seller_wallet_a";
const ADMIN = "admin_fin";
const SUPPORT = "support_user"; // support_admin role — zero finance perms

const ADMIN_ACTOR = { uid: ADMIN, email: `${ADMIN}@test.local` };

async function append(input: Parameters<typeof appendLedgerEntry>[1]) {
  return appendLedgerEntry("test-project", input);
}

async function credit(sellerId: string, amountMinor: number, key: string) {
  return append({
    sellerId,
    type: "ORDER_CREDIT",
    amountMinor,
    currency: "BDT",
    reference: key,
    createdBy: "system",
    idempotencyKey: key,
  });
}

// ═════════════════════════════════════════════════════════════════
// WALLET CREATION / DEFAULTS
// ═════════════════════════════════════════════════════════════════
describe("wallet: creation & defaults", () => {
  it("returns a zero-balance ACTIVE wallet for a seller with no history", async () => {
    const w = await getSellerWallet("test-project", SELLER);
    expect(w.availableMinor).toBe(0);
    expect(w.pendingMinor).toBe(0);
    expect(w.totalEarnedMinor).toBe(0);
    expect(w.totalWithdrawnMinor).toBe(0);
    expect(w.status).toBe("ACTIVE");
    expect(w.transactionCount).toBe(0);
    expect(w.currency).toBe("BDT");
  });

  it("materializes the wallet doc on the first ledger entry", async () => {
    await credit(SELLER, 10050, "order_1");
    const w = await getSellerWallet("test-project", SELLER);
    expect(w.availableMinor).toBe(10050);
    expect(w.totalEarnedMinor).toBe(10050);
    expect(w.transactionCount).toBe(1);
    expect(w.status).toBe("ACTIVE");
    expect(w.lastEntryType).toBe("ORDER_CREDIT");
  });

  it("paginates the ledger newest-first with a cursor", async () => {
    for (let i = 1; i <= 5; i++) await credit(SELLER, 1000 * i, `order_${i}`);
    const page1 = await queryWalletLedgerPage("test-project", SELLER, { limit: 3 });
    expect(page1.entries).toHaveLength(3);
    expect(page1.entries[0].seq).toBe(5); // newest first
    expect(page1.hasMore).toBe(true);

    const page2 = await queryWalletLedgerPage("test-project", SELLER, {
      limit: 3,
      before: page1.nextBefore,
    });
    expect(page2.entries).toHaveLength(2);
    expect(page2.hasMore).toBe(false);
    expect(page2.entries[0].seq).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════
// CREDIT / DEBIT / IDEMPOTENCY / VALIDATION
// ═════════════════════════════════════════════════════════════════
describe("wallet: ledger entries", () => {
  it("records direction/status/balances on every entry", async () => {
    const e = await credit(SELLER, 50000, "order_1");
    expect(e.direction).toBe("CREDIT");
    expect(e.status).toBe("COMPLETED");
    expect(e.balanceBefore).toBe(0);
    expect(e.balanceAfter).toBe(50000);

    const d = await append({
      sellerId: SELLER,
      type: "COMMISSION_DEBIT",
      amountMinor: 5000,
      currency: "BDT",
      createdBy: "system",
      idempotencyKey: "order_1_comm",
    });
    expect(d.direction).toBe("DEBIT");
    expect(d.balanceBefore).toBe(50000);
    expect(d.balanceAfter).toBe(45000);
  });

  it("replays a duplicate idempotency key as a no-op (never a double-post)", async () => {
    const first = await credit(SELLER, 10000, "order_1");
    const dup = await credit(SELLER, 10000, "order_1");
    expect(dup.transactionId).toBe(first.transactionId);
    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(10000);
    expect(wallet.transactionCount).toBe(1);
  });

  it("rejects unsafe/zero amounts", async () => {
    await expect(
      append({ sellerId: SELLER, type: "ORDER_CREDIT", amountMinor: 0, currency: "BDT", createdBy: "system" }),
        ).rejects.toThrow(/zero-amount|unsafe amountMinor/);
    await expect(
      append({ sellerId: SELLER, type: "ORDER_CREDIT", amountMinor: 1.5, currency: "BDT", createdBy: "system" }),
    ).rejects.toThrow(/unsafe amountMinor/);
  });

  it("rejects debits that would overdraw (negative balance protection)", async () => {
    await credit(SELLER, 10000, "order_1");
    await expect(
      append({
        sellerId: SELLER,
        type: "PAYOUT",
        amountMinor: 10001,
        currency: "BDT",
        createdBy: "system",
        idempotencyKey: "pay_1",
      }),
    ).rejects.toThrow(/invariant violated/);
    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(10000); // unchanged
  });

  it("treats completed ledger entries as immutable — corrections are new entries", async () => {
    await credit(SELLER, 10000, "order_1");
    // A wrong credit is corrected by a compensating ADJUSTMENT, never an edit:
    await append({
      sellerId: SELLER,
      type: "ADJUSTMENT",
      amountMinor: -10000,
      currency: "BDT",
      reference: "correction: order_1 credit posted in error",
      createdBy: "finance",
      idempotencyKey: "adj_corr_1",
    });
    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(0);
    expect(wallet.totalEarnedMinor).toBe(10000); // totalEarned only counts credits
    expect(wallet.transactionCount).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════
// CONCURRENCY — double-spend protection
// ═════════════════════════════════════════════════════════════════
describe("wallet: concurrency protection", () => {
  it("two parallel debits over overlapping balance — exactly one wins", async () => {
    await credit(SELLER, 100000, "order_1"); // ৳1000

    const results = await Promise.allSettled([
      append({ sellerId: SELLER, type: "SETTLEMENT_HOLD", amountMinor: 70000, currency: "BDT", createdBy: "system", idempotencyKey: "hold_a" }),
      append({ sellerId: SELLER, type: "SETTLEMENT_HOLD", amountMinor: 70000, currency: "BDT", createdBy: "system", idempotencyKey: "hold_b" }),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(30000);
    expect(wallet.pendingMinor).toBe(70000);
    expect(wallet.availableMinor).toBeGreaterThanOrEqual(0);

    const integrity = await verifyLedgerIntegrity(
      "test-project", SELLER,
      await querySellerLedger("test-project", SELLER),
    );
    expect(integrity.ok).toBe(true);
  });

  it("parallel duplicate credits with the same key — single post", async () => {
    const results = await Promise.allSettled([
      credit(SELLER, 50000, "order_dup"),
      credit(SELLER, 50000, "order_dup"),
      credit(SELLER, 50000, "order_dup"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(50000);
    expect(wallet.transactionCount).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════
// WITHDRAWAL LIFECYCLE
// ═════════════════════════════════════════════════════════════════
describe("wallet: withdrawal lifecycle", () => {
  beforeEach(async () => {
    await seedSeller(SELLER);
    await seedAdmin(ADMIN, "finance_admin");
    await seedAdmin(SUPPORT, "support_admin");
    await credit(SELLER, 100000, "order_1"); // ৳1000
  });

  it("requests a withdrawal atomically (hold + wallet + request doc)", async () => {
    const res = await requestWalletWithdrawal("test-project", SELLER, {
      amountTaka: 500,
      method: "bkash",
      destination: "01712345678",
    });
    expect(res.amountMinor).toBe(50000);
    expect(res.availableAfterMinor).toBe(50000);
    expect(res.pendingAfterMinor).toBe(50000);

    // Withdrawal doc exists and is REQUESTED
    const docRes = await fetch(`${BASE}/sellers/${SELLER}/withdrawals/${res.withdrawalId}`);
    expect(docRes.ok).toBe(true);
    const doc = (await docRes.json()) as { fields: Record<string, Record<string, unknown>> };
    const status = doc.fields["status"] as { stringValue?: string };
    expect(status.stringValue).toBe("REQUESTED");

    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(50000);
    expect(wallet.pendingMinor).toBe(50000);
  });

  it("rejects a withdrawal above the available balance", async () => {
    await expect(
      requestWalletWithdrawal("test-project", SELLER, {
        amountTaka: 6000, // ৳6000 > ৳1000 available
        method: "bkash",
        destination: "01712345678",
      }),
    ).rejects.toThrow(/INSUFFICIENT_BALANCE/);
    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(100000); // untouched
  });

  it("rejects invalid amounts, methods and destinations", async () => {
    await expect(
      requestWalletWithdrawal("test-project", SELLER, { amountTaka: 5, method: "bkash", destination: "01712345678" }),
    ).rejects.toThrow(/minimum withdrawal/i);
    await expect(
      requestWalletWithdrawal("test-project", SELLER, { amountTaka: -50, method: "bkash", destination: "01712345678" }),
    ).rejects.toThrow();
    await expect(
      requestWalletWithdrawal("test-project", SELLER, { amountTaka: 50, method: "crypto" as never, destination: "01712345678" }),
    ).rejects.toThrow(/unsupported withdrawal method/);
    await expect(
      requestWalletWithdrawal("test-project", SELLER, { amountTaka: 50, method: "bkash", destination: "12" }),
    ).rejects.toThrow(/valid payout destination/);
  });

  it("admin approve → release + payout, totalWithdrawn grows, idempotent re-run", async () => {
    const res = await requestWalletWithdrawal("test-project", SELLER, {
      amountTaka: 500,
      method: "bank",
      destination: "1234567890123",
    });

    const out = await processWalletWithdrawal("test-project", ADMIN_ACTOR, {
      sellerId: SELLER,
      withdrawalId: res.withdrawalId,
      action: "approve",
      note: "Paid via bFTB 2026-09-07",
    });
    expect(out.status).toBe("COMPLETED");

    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(50000);
    expect(wallet.pendingMinor).toBe(0);
    expect(wallet.totalWithdrawnMinor).toBe(50000);
    expect(wallet.transactionCount).toBe(4); // credit, hold, release, payout

    // Second processing attempt on the COMPLETED withdrawal → rejected
    await expect(
      processWalletWithdrawal("test-project", ADMIN_ACTOR, {
        sellerId: SELLER,
        withdrawalId: res.withdrawalId,
        action: "approve",
      }),
    ).rejects.toThrow(/already COMPLETED/);

    const integrity = await verifyLedgerIntegrity(
      "test-project", SELLER,
      await querySellerLedger("test-project", SELLER),
    );
    expect(integrity.ok).toBe(true);
  });

  it("admin reject → funds return to available, wallet net unchanged", async () => {
    const res = await requestWalletWithdrawal("test-project", SELLER, {
      amountTaka: 500,
      method: "bkash",
      destination: "01712345678",
    });
    const out = await processWalletWithdrawal("test-project", ADMIN_ACTOR, {
      sellerId: SELLER,
      withdrawalId: res.withdrawalId,
      action: "reject",
      note: "Destination number mismatch — verify and re-request",
    });
    expect(out.status).toBe("REJECTED");

    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(100000);
    expect(wallet.pendingMinor).toBe(0);
    expect(wallet.totalWithdrawnMinor).toBe(0);
  });

  it("blocks processing for roles without finance.payout", async () => {
    const res = await requestWalletWithdrawal("test-project", SELLER, {
      amountTaka: 500,
      method: "bkash",
      destination: "01712345678",
    });
    await expect(
      processWalletWithdrawal("test-project", { uid: SUPPORT, email: "s@test.local" }, {
        sellerId: SELLER,
        withdrawalId: res.withdrawalId,
        action: "approve",
      }),
    ).rejects.toThrow(/lacks finance.payout/);
    // even plain admin (finance.read only) cannot move money
    await seedAdmin("admin_plain", "admin");
    await expect(
      processWalletWithdrawal("test-project", { uid: "admin_plain", email: "a@test.local" }, {
        sellerId: SELLER,
        withdrawalId: res.withdrawalId,
        action: "approve",
      }),
    ).rejects.toThrow(/lacks finance.payout/);
  });
});

// ═════════════════════════════════════════════════════════════════
// WALLET STATUS LIFECYCLE
// ═════════════════════════════════════════════════════════════════
describe("wallet: status lifecycle", () => {
  beforeEach(async () => {
    await seedSeller(SELLER);
    await seedAdmin(ADMIN, "finance_admin");
    await credit(SELLER, 50000, "order_1");
  });

  it("SUSPENDED blocks withdrawals but allows order-flow entries", async () => {
    await setWalletStatus("test-project", ADMIN_ACTOR, {
      sellerId: SELLER,
      status: "SUSPENDED",
      reason: "Chargeback investigation case #8842",
    });
    await expect(
      requestWalletWithdrawal("test-project", SELLER, { amountTaka: 100, method: "bkash", destination: "01712345678" }),
    ).rejects.toThrow(/blocked/);

    // Order flow still posts (ledger must stay consistent with orders)
    await append({
      sellerId: SELLER,
      type: "ORDER_CREDIT",
      amountMinor: 5000,
      currency: "BDT",
      createdBy: "system",
      idempotencyKey: "order_2",
    });
    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(55000);
  });

  it("reactivation restores withdrawals", async () => {
    await setWalletStatus("test-project", ADMIN_ACTOR, { sellerId: SELLER, status: "SUSPENDED", reason: "Temporary risk review pending" });
    await setWalletStatus("test-project", ADMIN_ACTOR, { sellerId: SELLER, status: "ACTIVE", reason: "Risk review complete — cleared" });
    const res = await requestWalletWithdrawal("test-project", SELLER, { amountTaka: 100, method: "bkash", destination: "01712345678" });
    expect(res.amountMinor).toBe(10000);
  });

  it("CLOSED is terminal and blocks debits", async () => {
    await setWalletStatus("test-project", ADMIN_ACTOR, { sellerId: SELLER, status: "CLOSED", reason: "Seller account terminated for policy violations" });
    await expect(
      setWalletStatus("test-project", ADMIN_ACTOR, { sellerId: SELLER, status: "ACTIVE", reason: "Attempting to reopen a closed wallet" }),
    ).rejects.toThrow(/INVALID_STATE_TRANSITION/);
    await expect(
      requestWalletWithdrawal("test-project", SELLER, { amountTaka: 100, method: "bkash", destination: "01712345678" }),
    ).rejects.toThrow(/closed/);
    // Financial history is preserved — never deleted
    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.transactionCount).toBe(1);
  });

  it("requires a meaningful reason and finance.adjust permission", async () => {
    await expect(
      setWalletStatus("test-project", ADMIN_ACTOR, { sellerId: SELLER, status: "SUSPENDED", reason: "short" }),
    ).rejects.toThrow(/reason/);
    await expect(
      setWalletStatus("test-project", { uid: SUPPORT, email: "s@test.local" }, { sellerId: SELLER, status: "SUSPENDED", reason: "Support cannot touch finance" }),
    ).rejects.toThrow(/lacks finance.adjust/);
  });
});

// ═════════════════════════════════════════════════════════════════
// MANUAL ADJUSTMENTS
// ═════════════════════════════════════════════════════════════════
describe("wallet: manual adjustments", () => {
  beforeEach(async () => {
    await seedSeller(SELLER);
    await seedAdmin(ADMIN, "finance_admin");
    await credit(SELLER, 20000, "order_1");
  });

  it("credits with a reason — audit row + immutable ledger entry", async () => {
    const out = await postManualAdjustment("test-project", ADMIN_ACTOR, {
      sellerId: SELLER,
      amountTaka: 500.5,
      direction: "CREDIT",
      reason: "Compensation for verified service issue #771",
    });
    expect(out.availableAfterMinor).toBe(70050); // 20000 + 50050
    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.totalEarnedMinor).toBe(70050);

    // audit log row exists
    const logsRes = await fetch(`${BASE}/activityLogs`);
    const logs = (await logsRes.json()) as { documents?: Array<{ fields: Record<string, Record<string, unknown>> }> };
    const actions = (logs.documents ?? []).map((d) => (d.fields["action"] as { stringValue?: string })?.stringValue);
    expect(actions).toContain("MANUAL_CREDIT");
  });

  it("rejects debit over balance, short reasons, and unauthorized roles", async () => {
    await expect(
      postManualAdjustment("test-project", ADMIN_ACTOR, {
        sellerId: SELLER, amountTaka: 500, direction: "DEBIT", reason: "Debit exceeding the seller balance on purpose",
      }),
    ).rejects.toThrow(/invariant violated/);
    await expect(
      postManualAdjustment("test-project", ADMIN_ACTOR, {
        sellerId: SELLER, amountTaka: 100, direction: "CREDIT", reason: "too short",
      }),
    ).rejects.toThrow(/reason/);
    await expect(
      postManualAdjustment("test-project", { uid: SELLER, email: null }, {
        sellerId: SELLER, amountTaka: 100, direction: "CREDIT", reason: "Seller trying to credit itself",
      }),
    ).rejects.toThrow(/lacks finance.adjust/);
  });
});

// ═════════════════════════════════════════════════════════════════
// ADMIN VIEWS & PERMISSIONS (seller isolation)
// ═════════════════════════════════════════════════════════════════
describe("wallet: admin views & permissions", () => {
  beforeEach(async () => {
    await seedSeller(SELLER);
    await seedAdmin(ADMIN, "finance_admin");
    await seedAdmin(SUPPORT, "support_admin");
    await credit(SELLER, 30000, "order_1");
  });

  it("lists wallets for finance admins, joins shop names", async () => {
    const rows = await listAdminWallets("test-project", ADMIN, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].sellerId).toBe(SELLER);
    expect(rows[0].shopName).toBe(`Shop ${SELLER}`);
    expect(rows[0].wallet.availableMinor).toBe(30000);
  });

  it("denies wallet listing to roles without finance.read", async () => {
    await expect(listAdminWallets("test-project", SUPPORT, {})).rejects.toThrow(/lacks finance.read/);
    await expect(listAdminWallets("test-project", SELLER, {})).rejects.toThrow(/lacks finance.read/);
  });

  it("wallet detail includes ledger + withdrawals", async () => {
    const res = await requestWalletWithdrawal("test-project", SELLER, { amountTaka: 100, method: "bkash", destination: "01712345678" });
    const detail = await getAdminWalletDetail("test-project", ADMIN, SELLER, {});
    expect(detail.wallet.availableMinor).toBe(20000);
    expect(detail.ledger.entries.length).toBeGreaterThan(0);
    expect(detail.withdrawals.some((w) => w.withdrawalId === res.withdrawalId)).toBe(true);
  });

  it("requireFreshAuth rejects stale tokens for money-moving transports", async () => {
    const staleIat = Math.floor(Date.now() / 1000) - 600; // 10 min old
    await expect(requireFreshAuth(testToken(ADMIN, staleIat))).rejects.toThrow(/re-authentication required/i);
    await expect(requireFreshAuth(testToken(ADMIN))).resolves.toBe(ADMIN);
  });

  it("super_admin retains full finance authority", async () => {
    await seedAdmin("root_admin", "super_admin");
    await expect(requireFinancePermission("test-project", "root_admin", "finance.adjust")).resolves.toBeUndefined();
    await expect(requireFinancePermission("test-project", "root_admin", "finance.payout")).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════
// RECONCILIATION (spec §26 / §34)
// ═════════════════════════════════════════════════════════════════
describe("wallet: reconciliation", () => {
  beforeEach(async () => {
    await seedSeller(SELLER);
    await seedAdmin(ADMIN, "finance_admin");
  });

  it("ledger replay === wallet balances after mixed credits and debits", async () => {
    await credit(SELLER, 100000, "order_1");
    await append({ sellerId: SELLER, type: "COMMISSION_DEBIT", amountMinor: 8000, currency: "BDT", createdBy: "system", idempotencyKey: "order_1_comm" });
    await append({ sellerId: SELLER, type: "SHIPPING_DEBIT", amountMinor: 2000, currency: "BDT", createdBy: "system", idempotencyKey: "order_1_ship" });
    const wd = await requestWalletWithdrawal("test-project", SELLER, { amountTaka: 500, method: "bkash", destination: "01712345678" });
    await processWalletWithdrawal("test-project", ADMIN_ACTOR, { sellerId: SELLER, withdrawalId: wd.withdrawalId, action: "reject", note: "Test rejection for reconciliation flow" });

    const report = await runWalletReconciliation("test-project", ADMIN);
    expect(report.mismatches).toHaveLength(0);
    expect(report.sellersChecked).toBe(1);

    const balances = await getSellerBalances("test-project", SELLER);
    expect(balances.availableMinor).toBe(90000); // 100000 - 8000 - 2000
    expect(balances.heldMinor).toBe(0);
    expect(balances.paidOutMinor).toBe(0);
  });

  it("flags (never silently overwrites) a tampered balance doc", async () => {
    await credit(SELLER, 10000, "order_1");
    // Tamper: overwrite the balance doc's availableMinor directly
    await seedDoc(SELLER_FINANCE_COLLECTION + "/" + SELLER, {
      sellerId: SELLER,
      availableMinor: 99999, // tampered
      heldMinor: 0,
      paidOutMinor: 0,
      totalEarnedMinor: 10000,
      currency: "BDT",
      status: "ACTIVE",
      entrySeq: 1,
      updatedAt: Date.now(),
    });
    const report = await runWalletReconciliation("test-project", ADMIN);
    expect(report.mismatches.length).toBeGreaterThan(0);
    expect(report.mismatches[0]).toMatch(/seller/);
  });
});

// ═════════════════════════════════════════════════════════════════
// LEGACY MIGRATION (spec §38)
// ═════════════════════════════════════════════════════════════════
describe("wallet: legacy walletTx migration", () => {
  beforeEach(async () => {
    await seedSeller(SELLER);
    await seedAdmin(ADMIN, "finance_admin");
  });

  it("migrates legacy float entries to integer paisa, idempotently", async () => {
    await seedDoc(`sellers/${SELLER}/walletTx/leg_1`, { type: "earning", amount: 100.5, status: "completed", createdAt: 1757000000000 });
    await seedDoc(`sellers/${SELLER}/walletTx/leg_2`, { type: "withdrawal", amount: -30, status: "completed", createdAt: 1757000001000 });
    await seedDoc(`sellers/${SELLER}/walletTx/leg_3`, { type: "withdrawal", amount: -20, status: "pending", createdAt: 1757000002000 });
    await seedDoc(`sellers/${SELLER}/walletTx/leg_4`, { type: "bonus", amount: 10.25, status: "completed", createdAt: 1757000003000 });

    const out = await migrateLegacyWalletTx("test-project", ADMIN, SELLER);
    expect(out.migrated).toBe(3);
    expect(out.skippedPending).toBe(1);

    const wallet = await getSellerWallet("test-project", SELLER);
    expect(wallet.availableMinor).toBe(8075); // 10050 - 3000 + 1025
    expect(wallet.totalEarnedMinor).toBe(11075); // earnings + bonus credits
    expect(wallet.totalWithdrawnMinor).toBe(3000);
    expect(wallet.transactionCount).toBe(3);

    // Re-run: strictly a no-op
    const rerun = await migrateLegacyWalletTx("test-project", ADMIN, SELLER);
    expect(rerun.migrated).toBe(0);
    const wallet2 = await getSellerWallet("test-project", SELLER);
    expect(wallet2.transactionCount).toBe(3);

    const integrity = await verifyLedgerIntegrity(
      "test-project", SELLER,
      await querySellerLedger("test-project", SELLER),
    );
    expect(integrity.ok).toBe(true);
  });

  it("refuses migration without finance.adjust", async () => {
    await expect(migrateLegacyWalletTx("test-project", SUPPORT, SELLER)).rejects.toThrow(/lacks finance.adjust/);
  });
});
