/**
 * AVENTA SHOP — Cross-Seller Isolation: STATIC transport audit
 *
 * Pins the authorization chain the emulator tests can't reach directly
 * (TanStack transports are exercised end-to-end only at runtime):
 *   Client → transport schema → server authorization → ownership → mutation
 *
 * Asserts, per seller-facing transport:
 *   1. the request schema accepts NO seller identity field (sellerId,
 *      walletId, ledgerId, withdrawalId) — identity comes ONLY from
 *      the verified Firebase ID token
 *   2. the handler derives identity via verifySellerToken / verifyIdToken
 *   3. every admin transport enforces requireFinancePermission (and
 *      requireFreshAuth for money-moving actions)
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function read(relative: string): string {
  return fs.readFileSync(path.join("src", relative), "utf-8");
}

const FINANCE_TRANSPORTS = read("lib/finance/finance.functions.ts");
const SETTLEMENT_TRANSPORTS = read("lib/settlement.functions.ts");
const WALLET_AUTH = read("lib/finance/walletAuth.server.ts");
const RULES = fs.readFileSync("firestore.rules", "utf-8");

/** Extract one exported server function's full source block. */
function fn(source: string, name: string): string {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`transport ${name} not found`);
  // Block ends at the next top-level "// ═" separator or EOF
  const rest = source.slice(start);
  const endMatch = rest.slice(1).search(/\n\n\/\/ [═=]/);
  const block = endMatch >= 0 ? rest.slice(0, endMatch + 1) : rest;
  // .handler(...) closes with "});" — cut there for safety
  const closeIdx = block.indexOf("});");
  return closeIdx >= 0 ? block.slice(0, closeIdx + 3) : block;
}

/** Extract the zod schema declared just above a transport. */
function schemaFor(source: string, transport: string): string {
  const src = fn(source, transport);
  const m = src.match(/\.inputValidator\(\(data: unknown\) => (\w+)\.parse\(data\)\)/);
  if (!m) throw new Error(`schema for ${transport} not found`);
  const re = new RegExp(`const ${m[1]} = z\\.object\\(\\{([\\s\\S]*?)\\}\\);`);
  const sm = source.match(re);
  if (!sm) throw new Error(`schema body of ${m[1]} not found`);
  return sm[1];
}

const IDENTITY_FIELDS = /(sellerId|walletId|ledgerId|withdrawalId|adminUid)/;

describe("finance transports: seller actions are token-derived ONLY (no IDOR surface)", () => {
  const sellerTransports = [
    "getSellerWalletData",
    "getSellerWalletLedgerPage",
    "requestWalletWithdrawal",
  ] as const;

  for (const t of sellerTransports) {
    it(`${t}: schema rejects client-supplied seller identity`, () => {
      const schema = schemaFor(FINANCE_TRANSPORTS, t);
      expect(schema).not.toMatch(IDENTITY_FIELDS);
      expect(schema).toContain("idToken");
    });

    it(`${t}: handler derives identity from verifySellerToken`, () => {
      const src = fn(FINANCE_TRANSPORTS, t);
      expect(src).toContain("verifySellerToken");
      expect(src).not.toMatch(/data\.sellerId/);
    });
  }
});

describe("finance transports: admin actions enforce permission + fresh auth", () => {
  const permissionGates: Record<string, { permission: string; freshAuth: boolean }> = {
    getAdminWallets: { permission: "finance.read", freshAuth: false },
    getAdminWalletDetail: { permission: "finance.read", freshAuth: false },
    postWalletAdjustment: { permission: "finance.adjust", freshAuth: true },
    setWalletStatus: { permission: "finance.adjust", freshAuth: true },
    processWalletWithdrawal: { permission: "finance", freshAuth: true }, // approve|reject branch
    runFinanceReconciliation: { permission: "finance.reconcile", freshAuth: false },
    migrateLegacyWallet: { permission: "finance.adjust", freshAuth: true },
  };

  for (const [t, gate] of Object.entries(permissionGates)) {
    it(`${t}: requires ${gate.permission}${gate.freshAuth ? " + FRESH RE-AUTH" : ""}`, () => {
      const src = fn(FINANCE_TRANSPORTS, t);
      expect(src).toContain("requireFinancePermission");
      if (gate.freshAuth) expect(src).toContain("requireFreshAuth");
    });
  }
});

describe("finance transports: admin mutations re-check permission INSIDE wallet.server", () => {
  const walletServer = read("lib/finance/wallet.server.ts");
  const guarded = [
    "postManualAdjustment",
    "setWalletStatus",
    "processWalletWithdrawal",
    "runWalletReconciliation",
    "getAdminWalletDetail",
    "listAdminWallets",
  ];
  for (const g of guarded) {
    it(`${g}: wallet.server calls requireFinancePermission (defense-in-depth beyond the transport)`, () => {
      const start = walletServer.indexOf(`export async function ${g}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = walletServer.slice(start + 1).search(/export async function \w+/);
      const body =
        next >= 0 ? walletServer.slice(start, start + 1 + next) : walletServer.slice(start);
      expect(body).toContain("requireFinancePermission");
    });
  }
});

describe("settlement transports (legacy): authorization hardened", () => {
  it("getSellerCommissionRate: self-or-admin enforced (IDOR fix stays)", () => {
    const src = fn(SETTLEMENT_TRANSPORTS, "getSellerCommissionRate");
    expect(src).toContain("verifyIdToken");
    expect(src).toContain("uid !== data.sellerId");
    expect(src).toContain("verifyAdminAccount");
  });

  it("updateSellerCommissionRate: gated by finance.adjust (platform revenue security)", () => {
    const src = fn(SETTLEMENT_TRANSPORTS, "updateSellerCommissionRate");
    expect(src).toContain("requireFinancePermission");
    expect(src).toContain('"finance.adjust"');
  });

  it("markOrderDelivered: seller cannot mark ANOTHER seller's order (uid !== sellerId check)", () => {
    const src = fn(SETTLEMENT_TRANSPORTS, "markOrderDelivered");
    expect(src).toContain("uid !== data.sellerId");
  });

  it("processSettlementWithdrawal + reverseSettlement: blocked-aware admin verification, no raw REST fetches", () => {
    for (const t of ["processSettlementWithdrawal", "reverseSettlement"]) {
      const src = fn(SETTLEMENT_TRANSPORTS, t);
      expect(src).toContain("verifyAdminAccount");
    }
    // The old hardcoded production REST USER-DOC fetch (authorization
    // source) is gone — admin identity now flows through
    // verifyAdminAccount/batchGetDocs. (A post-authorization
    // best-effort seller-email fetch is not an authz read.)
    expect(SETTLEMENT_TRANSPORTS).not.toMatch(/firestore\.googleapis\.com[^`]*\/users\//);
  });

  it("verifyAdminAccount helper enforces role/blocked/sub-role (rules parity)", () => {
    const helperMatch = SETTLEMENT_TRANSPORTS.match(
      /async function verifyAdminAccount[\s\S]*?\n\}/,
    );
    expect(helperMatch).toBeTruthy();
    const helper = helperMatch![0];
    expect(helper).toContain('!== "admin"');
    expect(helper).toContain("blocked === true");
  });

  it("seller-facing settlement transports derive uid from the token (never from body)", () => {
    for (const t of ["releaseSettlements", "requestSettlementWithdrawal", "getSellerFinancials"]) {
      const src = fn(SETTLEMENT_TRANSPORTS, t);
      expect(src).toContain("verifyIdToken");
      expect(src).not.toMatch(/data\.sellerId/);
    }
  });
});

describe("walletAuth: verifySellerToken is the single seller-identity source", () => {
  it("verifies the ID token AND requires a sellers/{uid} doc", () => {
    expect(WALLET_AUTH).toContain("verifyIdToken");
    expect(WALLET_AUTH).toContain('["sellers", uid]');
    expect(WALLET_AUTH).toContain("seller account not found");
  });
});

describe("Firestore rules: cross-seller isolation blocks", () => {
  it("sellerLedger + sellerFinance deny ALL client access (server functions only)", () => {
    expect(RULES).toMatch(
      /match \/sellerLedger\/\{entryId\} \{[\s\S]*?allow read, write: if false;/,
    );
    expect(RULES).toMatch(
      /match \/sellerFinance\/\{sellerId\} \{[\s\S]*?allow read, write: if false;/,
    );
  });

  it("sellers/{uid} subcollection reads are owner-scoped (isSelf or admin)", () => {
    const sellersBlock = RULES.match(/match \/sellers\/\{uid\} \{[\s\S]*?\n {4}\}\n\n/);
    expect(sellersBlock).toBeTruthy();
    const block = sellersBlock![0];
    for (const sub of ["orders", "settlementTx", "walletTx", "withdrawals"]) {
      const subBlock = block.match(
        new RegExp(`match /${sub}/\\{\\w+\\} \\{[\\s\\S]*?\\n      \\}`),
      );
      expect(subBlock, `rules block for sellers/{uid}/${sub} missing`).toBeTruthy();
      expect(subBlock![0]).toContain("isSelf(uid) || isAdmin()");
    }
  });

  it("seller financial subcollections are NEVER client-writable", () => {
    const sellersBlock = RULES.match(/match \/sellers\/\{uid\} \{[\s\S]*?\n {4}\}\n\n/)![0];
    for (const sub of ["settlementTx", "walletTx", "withdrawals"]) {
      const subBlock = sellersBlock.match(
        new RegExp(`match /${sub}/\\{\\w+\\} \\{[\\s\\S]*?\\n      \\}`),
      )![0];
      expect(subBlock).toMatch(/allow create, update, delete: if false/);
    }
  });

  it("products + coupons: seller writes gated on resource sellerId == auth.uid", () => {
    expect(RULES).toMatch(/resource\.data\.sellerId == request\.auth\.uid/);
    // sellers can never self-publish or self-approve
    expect(RULES).toMatch(/request\.resource\.data\.approved == false/);
  });

  it("top-level finance docs (settlements/payouts/batches) are finance-role READ-ONLY", () => {
    expect(RULES).toMatch(/match \/settlements\/\{settlementId\} \{[\s\S]*?allow write: if false/);
    expect(RULES).toMatch(/match \/payouts\/\{payoutId\} \{[\s\S]*?allow write: if false/);
  });
});
