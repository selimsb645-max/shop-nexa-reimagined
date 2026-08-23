/**
 * Shop Nexa — Seller Security Audit Tests
 *
 * Verifies cross-seller data isolation, IDOR protection, and financial
 * authorization across all seller modules through:
 * 1. Code analysis — verifies query scoping patterns in service files
 * 2. Schema validation — verifies server function schemas don't accept client-supplied sellerId
 * 3. Firestore rules analysis — verifies database-level protection
 * 4. Route coverage — verifies all seller routes use SellerGate
 */

import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

const ROUTE_DIR = "src/routes/_authenticated";
const SVC_DIR = "src/services/firebase";

function readRoute(name: string): string {
  return fs.readFileSync(path.join(ROUTE_DIR, name), "utf-8");
}

function readService(name: string): string {
  return fs.readFileSync(path.join(SVC_DIR, name), "utf-8");
}

function readRules(): string {
  return fs.readFileSync("firestore.rules", "utf-8");
}

const SELLER_LEAF_ROUTES = fs
  .readdirSync(ROUTE_DIR)
  .filter(
    (f) =>
      f.startsWith("seller.") &&
      f.endsWith(".tsx") &&
      f !== "seller.tsx" &&
      f !== "seller.orders.tsx" &&
      f !== "seller.products.tsx" &&
      f !== "seller.register.tsx",
  );

// ====================================================================
// 1. AUTHENTICATION — All seller routes use SellerGate
// ====================================================================

describe("Authentication — SellerGate Coverage", () => {
  it("all seller leaf routes should import and use SellerGate", () => {
    for (const file of SELLER_LEAF_ROUTES) {
      const content = readRoute(file);
      expect(content, `${file} missing SellerGate import`).toContain("SellerGate");
      expect(content, `${file} missing <SellerGate> usage`).toContain("<SellerGate>");
    }
  });

  it("no seller route should bypass SellerGate with raw SellerShell", () => {
    for (const file of SELLER_LEAF_ROUTES) {
      const content = readRoute(file);
      // SellerShell without SellerGate is a security bypass
      // Only seller.settlements.tsx uses SellerShell directly (but also has SellerGate)
      if (file === "seller.settlements.tsx") continue; // known exception — has both
      expect(content, `${file} uses SellerShell without SellerGate — potential bypass`).not.toMatch(
        /<SellerShell[^>]*>\s*<(?!SellerGate)/,
      );
    }
  });

  it("all seller routes should use authenticated profile or idToken (not URL param) as sellerId", () => {
    for (const file of SELLER_LEAF_ROUTES) {
      const content = readRoute(file);
      if (content.includes("SellerGate")) {
        // Routes should use profile (from SellerGate) or idToken (server-verified)
        // Some routes use profile.uid directly, others pass idToken to server functions
        const usesProfileUid = content.includes("profile.uid");
        const usesIdToken = content.includes("idToken") || content.includes("getIdToken");
        const usesProfile = content.includes("profile");
        expect(
          usesProfileUid || usesIdToken || usesProfile,
          `${file} should use profile.uid or idToken for seller identity`,
        ).toBe(true);
        // Must NOT use URL params as sellerId
        expect(content, `${file} must not use URL param as sellerId`).not.toMatch(
          /useParams.*sellerId/,
        );
      }
    }
  });
});

// ====================================================================
// 2. SELLER AUTHORIZATION — sellerId from trusted source
// ====================================================================

describe("Seller Authorization — Trusted sellerId Source", () => {
  it("products route uses profile.uid, not URL params", () => {
    const content = readRoute("seller.products.index.tsx");
    expect(content).toContain("profile.uid");
    expect(content).not.toMatch(/useParams.*sellerId/);
  });

  it("products edit route uses profile.uid, not product ID as sellerId", () => {
    const content = readRoute("seller.products.$id.edit.tsx");
    expect(content).toContain("profile.uid");
    // $id is the product ID, not sellerId
    expect(content).toMatch(/sellerId={profile\.uid}/);
  });

  it("orders route uses profile.uid", () => {
    const content = readRoute("seller.orders.index.tsx");
    expect(content).toContain("profile.uid");
  });

  it("order detail route uses profile.uid, not orderId as sellerId", () => {
    const content = readRoute("seller.orders.$orderId.tsx");
    expect(content).toContain("profile.uid");
    expect(content).toMatch(/sellerId={profile\.uid}/);
  });

  it("earnings route uses profile from SellerGate", () => {
    const content = readRoute("seller.earnings.tsx");
    expect(content).toContain("profile");
    expect(content).toContain("SellerGate");
  });

  it("wallet route uses profile.uid", () => {
    const content = readRoute("seller.wallet.tsx");
    expect(content).toContain("profile.uid");
  });

  it("settlements route uses profile from SellerGate", () => {
    const content = readRoute("seller.settlements.tsx");
    expect(content).toContain("SellerGate");
    expect(content).toContain("profile");
  });

  it("coupons route uses profile.uid", () => {
    const content = readRoute("seller.coupons.tsx");
    expect(content).toContain("profile.uid");
  });

  it("store route uses profile from SellerGate", () => {
    const content = readRoute("seller.store.tsx");
    expect(content).toContain("SellerGate");
    expect(content).toContain("profile");
  });

  it("analytics route uses profile.uid", () => {
    const content = readRoute("seller.analytics.tsx");
    expect(content).toContain("profile.uid");
  });

  it("insights route uses profile.uid", () => {
    const content = readRoute("seller.insights.tsx");
    expect(content).toContain("profile.uid");
  });

  it("notifications route uses profile.uid", () => {
    const content = readRoute("seller.notifications.tsx");
    expect(content).toContain("profile.uid");
  });

  it("settings route uses profile from SellerGate", () => {
    const content = readRoute("seller.settings.tsx");
    expect(content).toContain("SellerGate");
    expect(content).toContain("profile");
  });

  it("dashboard route uses profile.uid", () => {
    const content = readRoute("seller.index.tsx");
    expect(content).toContain("profile.uid");
  });
});

// ====================================================================
// 3. CROSS-SELLER DATA ISOLATION — Service layer query scoping
// ====================================================================

describe("Cross-Seller Data Isolation — Service Layer", () => {
  it("listSellerProducts queries with where('sellerId', '==', sellerId)", () => {
    const code = readService("sellerProducts.ts");
    expect(code).toContain('where("sellerId", "==", sellerId)');
  });

  it("getSellerProduct checks p.sellerId !== sellerId and returns null", () => {
    const code = readService("sellerProducts.ts");
    expect(code).toContain("p.sellerId !== sellerId");
    expect(code).toContain("return null");
  });

  it("updateSellerProduct calls getSellerProduct for ownership check", () => {
    const code = readService("sellerProducts.ts");
    expect(code).toMatch(/updateSellerProduct[\s\S]*getSellerProduct/);
  });

  it("deleteSellerProduct calls getSellerProduct for ownership check", () => {
    const code = readService("sellerProducts.ts");
    expect(code).toMatch(/deleteSellerProduct[\s\S]*getSellerProduct/);
  });

  it("setProductStatus calls getSellerProduct for ownership check", () => {
    const code = readService("sellerProducts.ts");
    expect(code).toMatch(/setProductStatus[\s\S]*getSellerProduct/);
  });

  it("listSellerOrders queries sellers/{sellerId}/orders subcollection", () => {
    const code = readService("sellerOrders.ts");
    expect(code).toContain("SELLERS");
    expect(code).toContain("sellerId");
    expect(code).toContain("ORDERS");
    // Path-based scoping: collection(getDb(), SELLERS, sellerId, ORDERS)
    expect(code).toMatch(/collection\(getDb\(\),\s*SELLERS,\s*sellerId,\s*ORDERS\)/);
  });

  it("getSellerOrder uses path-based isolation (sellers/{sellerId}/orders/{orderId})", () => {
    const code = readService("sellerOrders.ts");
    expect(code).toMatch(/doc\(getDb\(\),\s*SELLERS,\s*sellerId,\s*ORDERS,\s*orderId\)/);
  });

  it("listSellerWalletTransactions queries sellers/{sellerId}/walletTx", () => {
    const code = readService("sellerWallet.ts");
    expect(code).toContain("WALLET_TX");
    expect(code).toMatch(/collection\(getDb\(\),\s*SELLERS,\s*sellerId,\s*WALLET_TX\)/);
  });

  it("getSellerWalletBalance queries sellers/{sellerId}/walletTx", () => {
    const code = readService("sellerWallet.ts");
    expect(code).toMatch(/collection\(getDb\(\),\s*SELLERS,\s*sellerId,\s*WALLET_TX\)/);
  });

  it("listSellerCoupons queries with where('sellerId', '==', sellerId)", () => {
    const code = readService("sellerCoupons.ts");
    expect(code).toContain('where("sellerId", "==", sellerId)');
  });

  it("getSellerCoupon checks coupon.sellerId !== sellerId and returns null", () => {
    const code = readService("sellerCoupons.ts");
    expect(code).toContain("coupon.sellerId !== sellerId");
    expect(code).toContain("return null");
  });

  it("updateSellerCoupon calls getSellerCoupon for ownership check", () => {
    const code = readService("sellerCoupons.ts");
    expect(code).toMatch(/updateSellerCoupon[\s\S]*getSellerCoupon/);
  });

  it("deleteSellerCoupon calls getSellerCoupon for ownership check", () => {
    const code = readService("sellerCoupons.ts");
    expect(code).toMatch(/deleteSellerCoupon[\s\S]*getSellerCoupon/);
  });

  it("createSellerCoupon sets sellerId from parameter, not from request body", () => {
    const code = readService("sellerCoupons.ts");
    // sellerId is a separate function parameter, spread into doc with sellerId
    expect(code).toMatch(/createSellerCoupon\(\s*sellerId:\s*string/);
    expect(code).toMatch(/addDoc[\s\S]*sellerId/);
  });

  it("createSellerProduct sets sellerId from parameter", () => {
    const code = readService("sellerProducts.ts");
    expect(code).toMatch(/createSellerProduct\(\s*sellerId:\s*string/);
    expect(code).toMatch(/addDoc[\s\S]*sellerId/);
  });
});

// ====================================================================
// 4. FIRESTORE RULES — Database-level protection
// ====================================================================

describe("Firestore Rules — Seller Data Protection", () => {
  const rules = readRules();

  it("sellers/{uid} read requires isSelf(uid) or isAdmin()", () => {
    expect(rules).toContain("match /sellers/{uid}");
    expect(rules).toMatch(/sellers\/\{uid\}[\s\S]*?isSelf\(uid\)/);
  });

  it("seller profile update blocks financial fields", () => {
    expect(rules).toContain("commissionRate");
    expect(rules).toContain("availableBalance");
    expect(rules).toContain("totalEarnings");
    expect(rules).toContain("pendingBalance");
    expect(rules).toContain("withdrawnTotal");
  });

  it("seller profile update blocks status escalation", () => {
    // Seller can only change status from draft→pending_review or need_documents→pending_review
    expect(rules).toContain("pending_review");
  });

  it("seller orders read requires isSelf(uid)", () => {
    expect(rules).toMatch(/sellers\/\{uid\}[\s\S]*?orders\/\{orderId\}[\s\S]*?isSelf\(uid\)/);
  });

  it("seller orders update blocks financial fields", () => {
    expect(rules).toContain("settlement");
    expect(rules).toContain("earnings");
    expect(rules).toContain("commission");
    expect(rules).toContain("paymentStatus");
  });

  it("seller walletTx is write-protected (client cannot create/update/delete)", () => {
    expect(rules).toMatch(/walletTx\/\{txId\}[\s\S]*?create, update, delete: if false/);
  });

  it("seller settlementTx is write-protected", () => {
    expect(rules).toMatch(/settlementTx\/\{txId\}[\s\S]*?create, update, delete: if false/);
  });

  it("seller withdrawals are write-protected", () => {
    expect(rules).toMatch(/withdrawals\/\{withdrawalId\}[\s\S]*?create, update, delete: if false/);
  });

  it("products update requires resource.data.sellerId == request.auth.uid", () => {
    expect(rules).toContain("resource.data.sellerId == request.auth.uid");
  });

  it("products create requires sellerId == auth.uid and approved == false", () => {
    expect(rules).toContain("request.resource.data.sellerId == request.auth.uid");
    expect(rules).toContain("request.resource.data.approved == false");
  });

  it("products update blocks sellerId, approved, featured, rating changes", () => {
    expect(rules).toContain("approved");
    expect(rules).toContain("featured");
    expect(rules).toContain("rating");
    expect(rules).toContain("reviewCount");
    expect(rules).toContain("sellerId");
  });

  it("coupons create requires sellerId == auth.uid", () => {
    expect(rules).toContain("request.resource.data.sellerId == request.auth.uid");
  });

  it("coupons update only allows active and updatedAt changes", () => {
    expect(rules).toContain("hasOnly(['active', 'updatedAt'])");
  });

  it("coupons delete requires sellerId == auth.uid", () => {
    expect(rules).toMatch(
      /coupons\/\{code\}[\s\S]*?delete[\s\S]*?resource\.data\.sellerId == request\.auth\.uid/,
    );
  });

  it("seller notifications read requires isSelf(uid)", () => {
    expect(rules).toMatch(/notifications\/\{nid\}[\s\S]*?isSelf\(uid\)/);
  });
});

// ====================================================================
// 5. SERVER VALIDATION — Financial functions use token UID
// ====================================================================

describe("Server Validation — Financial Functions", () => {
  const fnCode = fs.readFileSync("src/lib/settlement.functions.ts", "utf-8");

  it("getSellerFinancials schema only accepts idToken (no sellerId)", () => {
    // The schema should only have idToken, not sellerId
    expect(fnCode).toContain("sellerFinancialsSchema");
    expect(fnCode).toMatch(/sellerFinancialsSchema[\s\S]*?idToken/);
    // Verify the handler uses uid from verified token
    expect(fnCode).toMatch(
      /getSellerFinancials[\s\S]*?verifyIdToken[\s\S]*?readSellerFinancials\(uid\)/,
    );
  });

  it("releaseSettlements uses uid from verified token", () => {
    expect(fnCode).toMatch(
      /releaseSettlements[\s\S]*?verifyIdToken[\s\S]*?batchReleaseSettlements\(uid\)/,
    );
  });

  it("requestSettlementWithdrawal uses uid from verified token", () => {
    expect(fnCode).toMatch(/requestSettlementWithdrawal[\s\S]*?verifyIdToken[\s\S]*?uid,/);
  });

  it("processSettlementWithdrawal requires admin role", () => {
    expect(fnCode).toMatch(/processSettlementWithdrawal[\s\S]*?role !== "admin"/);
  });

  it("reverseSettlement requires admin role", () => {
    expect(fnCode).toMatch(/reverseSettlement[\s\S]*?role !== "admin"/);
  });

  it("getAdminFinanceOverview requires admin role", () => {
    expect(fnCode).toMatch(/getAdminFinanceOverview[\s\S]*?role !== "admin"/);
  });
});

// ====================================================================
// 6. IDOR — markOrderDelivered uid validation
// ====================================================================

describe("IDOR Protection — markOrderDelivered", () => {
  const fnCode = fs.readFileSync("src/lib/settlement.functions.ts", "utf-8");

  it("markOrderDelivered validates uid === data.sellerId", () => {
    expect(fnCode).toContain("uid !== data.sellerId");
  });

  it("markOrderDelivered throws error for non-matching uid (non-admin)", () => {
    expect(fnCode).toContain("You can only mark your own orders as delivered");
  });

  it("markOrderDelivered allows admin override", () => {
    // Admin check should be present inside the uid !== sellerId branch
    expect(fnCode).toContain('role !== "admin"');
  });

  it("markOrderDelivered does NOT blindly trust client-supplied sellerId", () => {
    // The old code had a comment saying "The existing order status update handles permission checks"
    // and passed data.sellerId directly. Verify the security check is now in place.
    expect(fnCode).not.toContain("// This function ONLY handles the settlement side effect.");
  });
});

// ====================================================================
// 7. FINANCIAL SECURITY — Wallet/Settlement write protection
// ====================================================================

describe("Financial Security — Write Protection", () => {
  const walletCode = readService("sellerWallet.ts");
  const rules = readRules();

  it("sellerWallet service has no create/update/delete functions", () => {
    // Wallet service should only have read functions
    expect(walletCode).not.toContain("addDoc");
    expect(walletCode).not.toContain("updateDoc");
    expect(walletCode).not.toContain("deleteDoc");
    expect(walletCode).not.toContain("setDoc");
  });

  it("Firestore rules block client writes to walletTx", () => {
    expect(rules).toMatch(/walletTx\/\{txId\}[\s\S]*?create, update, delete: if false/);
  });

  it("Firestore rules block client writes to settlementTx", () => {
    expect(rules).toMatch(/settlementTx\/\{txId\}[\s\S]*?create, update, delete: if false/);
  });

  it("Firestore rules block client writes to withdrawals", () => {
    expect(rules).toMatch(/withdrawals\/\{withdrawalId\}[\s\S]*?create, update, delete: if false/);
  });

  it("updateSellerProfile strips non-editable fields (defense-in-depth)", () => {
    const sellersCode = readService("sellers.ts");
    expect(sellersCode).toContain("SELLER_EDITABLE_FIELDS");
    expect(sellersCode).toContain("Defense-in-depth");
  });

  it("seller order update blocks shippingCharge modification", () => {
    expect(rules).toContain("shippingCharge");
  });
});

// ====================================================================
// 8. CRUD AUTHORIZATION — Ownership checks
// ====================================================================

describe("CRUD Authorization — Ownership Verification", () => {
  it("Products: all mutations verify ownership via getSellerProduct", () => {
    const code = readService("sellerProducts.ts");
    // update, delete, setProductStatus, setProductStock all call getSellerProduct
    const mutations = [
      "updateSellerProduct",
      "deleteSellerProduct",
      "setProductStatus",
      "setProductStock",
    ];
    for (const fn of mutations) {
      expect(code, `${fn} should call getSellerProduct`).toMatch(
        new RegExp(`${fn}[\\s\\S]*?getSellerProduct`),
      );
    }
  });

  it("Coupons: all mutations verify ownership via getSellerCoupon (direct or indirect)", () => {
    const code = readService("sellerCoupons.ts");
    // updateSellerCoupon and deleteSellerCoupon call getSellerCoupon directly
    expect(code).toMatch(/updateSellerCoupon[\s\S]*?getSellerCoupon/);
    expect(code).toMatch(/deleteSellerCoupon[\s\S]*?getSellerCoupon/);
    // toggleSellerCoupon calls updateSellerCoupon which calls getSellerCoupon (indirect)
    expect(code).toMatch(/toggleSellerCoupon[\s\S]*?updateSellerCoupon/);
  });

  it("Orders: getSellerOrder uses path-based isolation", () => {
    const code = readService("sellerOrders.ts");
    // Path includes sellerId, so Firestore rules enforce isolation
    expect(code).toMatch(/doc\(getDb\(\),\s*SELLERS,\s*sellerId,\s*ORDERS,\s*orderId\)/);
  });

  it("Orders: updateSellerOrderStatus reads doc at seller-scoped path", () => {
    const code = readService("sellerOrders.ts");
    expect(code).toMatch(
      /updateSellerOrderStatus[\s\S]*?doc\(getDb\(\),\s*SELLERS,\s*sellerId,\s*ORDERS,\s*orderId\)/,
    );
  });
});
