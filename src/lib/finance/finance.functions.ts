/**
 * AVENTA SHOP — Wallet & Finance Server Function Transports
 *
 * Every handler:
 *   1. Validates the caller's Firebase ID token (verifyIdToken)
 *   2. Enforces ownership (sellers see ONLY their own wallet) or
 *      finance permissions (admin actions re-checked server-side)
 *   3. Delegates to src/lib/finance/wallet.server.ts
 *
 * SECURITY: the client can NEVER read/write sellerFinance or
 * sellerLedger directly — Firestore rules deny all client access and
 * these transports are the only bridge (server-verified identity).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getProjectId } from "../firebase-admin.server";

// ────────────────────────────────────────────────────────────────────
// Shared schema
// ────────────────────────────────────────────────────────────────────

const ledgerTypeSchema = z.enum([
  "ORDER_CREDIT",
  "COMMISSION_DEBIT",
  "SHIPPING_DEBIT",
  "REFUND_DEBIT",
  "ADJUSTMENT",
  "SETTLEMENT_HOLD",
  "SETTLEMENT_RELEASE",
  "PAYOUT",
  "PAYOUT_REVERSAL",
]);

// ────────────────────────────────────────────────────────────────────
// 1. SELLER — wallet overview + first ledger page
// ────────────────────────────────────────────────────────────────────

const sellerWalletSchema = z.object({
  idToken: z.string().min(10),
  type: ledgerTypeSchema.optional(),
});

export const getSellerWalletData = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sellerWalletSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifySellerToken } = await import("./walletAuth.server");
    const { uid } = await verifySellerToken(data.idToken);
    const projectId = getProjectId();
    const { getSellerWallet, queryWalletLedgerPage, listSellerWithdrawals } =
      await import("./wallet.server");
    const [wallet, ledger, withdrawals] = await Promise.all([
      getSellerWallet(projectId, uid),
      queryWalletLedgerPage(projectId, uid, { type: data.type ?? null, limit: 25 }),
      listSellerWithdrawals(projectId, uid, 10),
    ]);
    return { wallet, ledger, withdrawals };
  });

// ────────────────────────────────────────────────────────────────────
// 2. SELLER — paginated ledger history (cursor = last seq)
// ────────────────────────────────────────────────────────────────────

const ledgerPageSchema = z.object({
  idToken: z.string().min(10),
  before: z.number().int().positive().nullable().optional(),
  type: ledgerTypeSchema.optional(),
});

export const getSellerWalletLedgerPage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ledgerPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifySellerToken } = await import("./walletAuth.server");
    const { uid } = await verifySellerToken(data.idToken);
    const { queryWalletLedgerPage } = await import("./wallet.server");
    return queryWalletLedgerPage(getProjectId(), uid, {
      type: data.type ?? null,
      before: data.before ?? null,
      limit: 25,
    });
  });

// ────────────────────────────────────────────────────────────────────
// 3. SELLER — withdrawal request (ledger-backed reservation)
// ────────────────────────────────────────────────────────────────────

const withdrawRequestSchema = z.object({
  idToken: z.string().min(10),
  amountTaka: z.number().positive().max(1_000_000),
  method: z.enum(["bank", "bkash", "nagad", "rocket"]),
  destination: z.string().trim().min(4).max(200),
});

export const requestWalletWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => withdrawRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifySellerToken } = await import("./walletAuth.server");
    const { uid } = await verifySellerToken(data.idToken);
    const { requestWalletWithdrawal: request } = await import("./wallet.server");
    return request(getProjectId(), uid, {
      amountTaka: data.amountTaka,
      method: data.method,
      destination: data.destination,
    });
  });

// ────────────────────────────────────────────────────────────────────
// 4. ADMIN — wallet list (finance.read)
// ────────────────────────────────────────────────────────────────────

const adminWalletsSchema = z.object({
  idToken: z.string().min(10),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "LOCKED", "CLOSED"]).optional(),
});

export const getAdminWallets = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminWalletsSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("../firebase-admin.server");
    const { uid } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const { requireFinancePermission } = await import("./settlementBatch.server");
    await requireFinancePermission(projectId, uid, "finance.read");
    const { listAdminWallets } = await import("./wallet.server");
    return listAdminWallets(projectId, uid, {
      search: data.search,
      status: data.status ?? null,
    });
  });

// ────────────────────────────────────────────────────────────────────
// 5. ADMIN — wallet detail (finance.read)
// ────────────────────────────────────────────────────────────────────

const adminWalletDetailSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(6).max(64),
  type: ledgerTypeSchema.optional(),
  before: z.number().int().positive().nullable().optional(),
});

export const getAdminWalletDetail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminWalletDetailSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("../firebase-admin.server");
    const { uid } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const { requireFinancePermission } = await import("./settlementBatch.server");
    await requireFinancePermission(projectId, uid, "finance.read");
    const { getAdminWalletDetail: detail } = await import("./wallet.server");
    return detail(projectId, uid, data.sellerId, {
      type: data.type ?? null,
      before: data.before ?? null,
    });
  });

// ────────────────────────────────────────────────────────────────────
// 6. ADMIN — manual adjustment (finance.adjust + FRESH RE-AUTH)
// ────────────────────────────────────────────────────────────────────

const adjustmentSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(6).max(64),
  amountTaka: z.number().positive().max(1_000_000),
  direction: z.enum(["CREDIT", "DEBIT"]),
  reason: z.string().trim().min(10).max(500),
  reference: z.string().trim().max(120).optional(),
});

export const postWalletAdjustment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adjustmentSchema.parse(data))
  .handler(async ({ data }) => {
    const projectId = getProjectId();
    const { requireFreshAuth } = await import("./settlementBatch.server");
    const uid = await requireFreshAuth(data.idToken);
    const { requireFinancePermission } = await import("./settlementBatch.server");
    await requireFinancePermission(projectId, uid, "finance.adjust");
    const { verifyIdToken } = await import("../firebase-admin.server");
    const { email } = await verifyIdToken(data.idToken);
    const { postManualAdjustment } = await import("./wallet.server");
    return postManualAdjustment(
      projectId,
      { uid, email },
      {
        sellerId: data.sellerId,
        amountTaka: data.amountTaka,
        direction: data.direction,
        reason: data.reason,
        reference: data.reference,
      },
    );
  });

// ────────────────────────────────────────────────────────────────────
// 7. ADMIN — wallet status change (finance.adjust + FRESH RE-AUTH)
// ────────────────────────────────────────────────────────────────────

const walletStatusSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(6).max(64),
  status: z.enum(["ACTIVE", "SUSPENDED", "LOCKED", "CLOSED"]),
  reason: z.string().trim().min(10).max(500),
});

export const setWalletStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => walletStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const projectId = getProjectId();
    const { requireFreshAuth, requireFinancePermission } = await import("./settlementBatch.server");
    const uid = await requireFreshAuth(data.idToken);
    await requireFinancePermission(projectId, uid, "finance.adjust");
    const { verifyIdToken } = await import("../firebase-admin.server");
    const { email } = await verifyIdToken(data.idToken);
    const { setWalletStatus: setStatus } = await import("./wallet.server");
    return setStatus(
      projectId,
      { uid, email },
      {
        sellerId: data.sellerId,
        status: data.status,
        reason: data.reason,
      },
    );
  });

// ────────────────────────────────────────────────────────────────────
// 8. ADMIN — process withdrawal (approve: finance.payout + fresh auth;
//            reject: finance.settlement)
// ────────────────────────────────────────────────────────────────────

const processWithdrawalSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(6).max(64),
  withdrawalId: z.string().min(6).max(64),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export const processWalletWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => processWithdrawalSchema.parse(data))
  .handler(async ({ data }) => {
    const projectId = getProjectId();
    const { requireFreshAuth, requireFinancePermission } = await import("./settlementBatch.server");
    const uid = await requireFreshAuth(data.idToken);
    await requireFinancePermission(
      projectId,
      uid,
      data.action === "approve" ? "finance.payout" : "finance.settlement",
    );
    const { verifyIdToken } = await import("../firebase-admin.server");
    const { email } = await verifyIdToken(data.idToken);
    const { processWalletWithdrawal: process } = await import("./wallet.server");
    return process(
      projectId,
      { uid, email },
      {
        sellerId: data.sellerId,
        withdrawalId: data.withdrawalId,
        action: data.action,
        note: data.note,
      },
    );
  });

// ────────────────────────────────────────────────────────────────────
// 9. ADMIN — reconciliation (finance.reconcile)
// ────────────────────────────────────────────────────────────────────

const reconcileSchema = z.object({ idToken: z.string().min(10) });

export const runFinanceReconciliation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reconcileSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("../firebase-admin.server");
    const { uid } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const { requireFinancePermission } = await import("./settlementBatch.server");
    await requireFinancePermission(projectId, uid, "finance.reconcile");
    const { runWalletReconciliation } = await import("./wallet.server");
    return runWalletReconciliation(projectId, uid);
  });

// ────────────────────────────────────────────────────────────────────
// 10. ADMIN — legacy wallet migration (finance.adjust + fresh auth)
// ────────────────────────────────────────────────────────────────────

const migrateSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(6).max(64),
});

export const migrateLegacyWallet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => migrateSchema.parse(data))
  .handler(async ({ data }) => {
    const projectId = getProjectId();
    const { requireFreshAuth, requireFinancePermission } = await import("./settlementBatch.server");
    const uid = await requireFreshAuth(data.idToken);
    await requireFinancePermission(projectId, uid, "finance.adjust");
    const { migrateLegacyWalletTx } = await import("./wallet.server");
    return migrateLegacyWalletTx(projectId, uid, data.sellerId);
  });
