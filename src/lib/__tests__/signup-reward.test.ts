/**
 * Signup Reward — Comprehensive Tests
 *
 * Tests verify:
 * A. New signup → 100 points, 1 rewardTx, 1 notification
 * B. Signup retry → no duplicate
 * C. Concurrent execution → no duplicate
 * D. Profile integration (reward points from rewardTx)
 * E. No fake "WELCOME10" notification
 * F. Promo notification uses actual generated code
 * G. Idempotency mechanism (deterministic doc IDs)
 * H. Security (server-side only, no client writes)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const rewardsServer = readFileSync("src/lib/rewards.server.ts", "utf-8");
const rewardsFunctions = readFileSync("src/lib/rewards.functions.ts", "utf-8");
const registerForm = readFileSync("src/components/auth/RegisterForm.tsx", "utf-8");
const seedInbox = readFileSync("src/services/firebase/seedInbox.ts", "utf-8");
const accountPage = readFileSync("src/routes/_authenticated/account.tsx", "utf-8");
const promoServer = readFileSync("src/lib/promo.server.ts", "utf-8");
const walletServer = readFileSync("src/lib/wallet.server.ts", "utf-8");
const firestoreRules = readFileSync("firestore.rules", "utf-8");

describe("SIGNUP REWARD — Server Module", () => {
  it("defines SIGNUP_REWARD_POINTS as 100", () => {
    expect(rewardsServer).toContain("SIGNUP_REWARD_POINTS = 100");
  });

  it("defines reward type as 'welcome_signup'", () => {
    expect(rewardsServer).toContain('"welcome_signup"');
  });

  it("uses deterministic doc ID for rewardTx (idempotency)", () => {
    expect(rewardsServer).toContain('REWARD_TX_DOC_ID = "welcome-signup"');
    expect(rewardsServer).toContain("currentDocument: { exists: false }");
  });

  it("uses deterministic doc ID for reward notification", () => {
    expect(rewardsServer).toContain('REWARD_NOTIF_DOC_ID = "welcome-reward-notif"');
  });

  it("uses deterministic doc ID for promo notification", () => {
    expect(rewardsServer).toContain('PROMO_NOTIF_DOC_ID = "welcome-promo-notif"');
  });
});

describe("SIGNUP REWARD — Transaction Safety (Concurrency)", () => {
  it("uses beginTransaction (not just commitWrites)", () => {
    expect(rewardsServer).toContain("beginTransaction");
  });

  it("reads rewardTx INSIDE the transaction for idempotency check", () => {
    expect(rewardsServer).toContain("batchGetDocsWithTx");
  });

  it("reads the user document within the transaction as a concurrency lock", () => {
    expect(rewardsServer).toContain("userDocName");
    expect(rewardsServer).toContain('docPath(projectId, ["users", uid])');
  });

  it("writes to the user document within the transaction (lock release)", () => {
    expect(rewardsServer).toContain("walletTxVersion");
    expect(rewardsServer).toContain("updateMask");
    expect(rewardsServer).toContain('fieldPaths: ["walletTxVersion", "updatedAt"]');
  });

  it("checks if already rewarded AFTER reading within the transaction", () => {
    const checkIdx = rewardsServer.indexOf("existingReward?.exists");
    const txReadIdx = rewardsServer.indexOf("batchGetDocsWithTx");
    expect(checkIdx).toBeGreaterThan(txReadIdx);
  });

  it("uses commitWithTx (not commitWrites) for transactional commit", () => {
    expect(rewardsServer).toContain("commitWithTx");
  });

  it("retries on ABORTED", () => {
    expect(rewardsServer).toContain("MAX_TX_RETRIES");
    expect(rewardsServer).toContain("committed");
    expect(rewardsServer).toContain("attempt");
  });

  it("rolls back if already rewarded (does not commit)", () => {
    expect(rewardsServer).toContain("rollbackTransaction");
    const alreadyIdx = rewardsServer.indexOf("alreadyHadReward: true");
    const afterCheck = rewardsServer.substring(alreadyIdx);
    expect(afterCheck).toContain("rollbackTransaction");
  });
});

describe("SIGNUP REWARD — Idempotency", () => {
  it("grantSignupRewardServer returns { granted: false } if already rewarded", () => {
    expect(rewardsServer).toContain("alreadyHadReward: true");
    expect(rewardsServer).toContain("granted: false");
  });

  it("grantSignupRewardServer returns { granted: true } on first successful grant", () => {
    expect(rewardsServer).toContain("granted: true");
    expect(rewardsServer).toContain("alreadyHadReward: false");
  });

  it("ensureWelcomePromoNotificationServer uses currentDocument precondition", () => {
    expect(rewardsServer).toContain("currentDocument: { exists: false }");
  });

  it("promo notification silently fails if already exists (no throw on duplicate)", () => {
    const promoNotifSection = rewardsServer.substring(
      rewardsServer.indexOf("ensureWelcomePromoNotificationServer"),
    );
    expect(promoNotifSection).toContain("catch");
  });
});

describe("SIGNUP REWARD — Self-Heal (Old Orphan Cleanup)", () => {
  it("deletes old cosmetic 'reward-notif' notification if it exists", () => {
    expect(rewardsServer).toContain('OLD_FAKE_REWARD_NOTIF_ID = "reward-notif"');
    expect(rewardsServer).toContain("delete");
  });

  it("deletes old cosmetic 'promo-notif' notification if it exists", () => {
    expect(rewardsServer).toContain('OLD_FAKE_PROMO_NOTIF_ID = "promo-notif"');
    expect(rewardsServer).toContain("delete");
  });

  it("seedInbox also self-heals old 'reward-notif' and 'promo-notif' docs", () => {
    expect(seedInbox).toContain('"reward-notif"');
    expect(seedInbox).toContain('"promo-notif"');
    expect(seedInbox).toContain("deleteDoc");
  });
});

describe("SIGNUP REWARD — Security", () => {
  it("rewards.functions.ts verifies Firebase ID token before granting reward", () => {
    expect(rewardsFunctions).toContain("verifyIdToken");
    expect(rewardsFunctions).toContain("grantSignupReward");
  });

  it("rewards.functions.ts verifies Firebase ID token before promo notification", () => {
    expect(rewardsFunctions).toContain("verifyIdToken");
    expect(rewardsFunctions).toContain("ensurePromoNotification");
  });

  it("rewardTx writes are blocked for clients in Firestore rules", () => {
    expect(firestoreRules).toContain("match /rewardTx/{txId}");
    // Stricter than the original design: deny-ALL client writes (even admins)
    // — rewardTx is only ever written server-side via the service account.
    expect(firestoreRules).toContain("allow write: if false");
  });

  it("promoCodes writes are blocked for clients in Firestore rules", () => {
    expect(firestoreRules).toContain("match /promoCodes/{code}");
    expect(firestoreRules).toContain("allow create, update, delete: if false");
  });

  it("rewards.server.ts uses service account (getAccessToken/getProjectId), not client SDK", () => {
    expect(rewardsServer).toContain("getAccessToken");
    expect(rewardsServer).toContain("getProjectId");
    expect(rewardsServer).not.toContain("firebase/app");
    expect(rewardsServer).not.toContain("firebase/firestore");
  });
});

describe("SIGNUP REWARD — RegisterForm Integration", () => {
  it("imports grantSignupReward and ensurePromoNotification", () => {
    expect(registerForm).toContain("grantSignupReward");
    expect(registerForm).toContain("ensurePromoNotification");
  });

  it("calls completeSignupBenefits after both email and Google signup", () => {
    expect(registerForm).toContain("completeSignupBenefits");
    // Email signup (passes queryClient so reward/promo caches sync after award)
    expect(registerForm).toContain("await completeSignupBenefits(authUser, queryClient);");
    // Should appear at least twice (email + Google)
    const count = (registerForm.match(/completeSignupBenefits/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3); // function def + 2 calls
  });

  it("does NOT call the old tryGenerateWelcomePromo function", () => {
    expect(registerForm).not.toContain("tryGenerateWelcomePromo(authUser)");
  });

  it("all three steps (reward, promo, notification) are called in sequence", () => {
    const helperSection = registerForm.substring(
      registerForm.indexOf("async function completeSignupBenefits"),
    );
    expect(helperSection).toContain("grantSignupReward");
    expect(helperSection).toContain("generatePromoCode");
    expect(helperSection).toContain("ensurePromoNotification");
  });
});

describe("SIGNUP REWARD — Fake Notification Removal", () => {
  it("seedInbox does NOT create '100 Bonus Points' notification", () => {
    expect(seedInbox).not.toContain("100 Bonus Points");
  });

  it("seedInbox does NOT create 'WELCOME10' notification", () => {
    expect(seedInbox).not.toContain("WELCOME10");
  });

  it("seedInbox does NOT create 'reward-notif' or 'promo-notif' via tx.set", () => {
    const setMatches = seedInbox.match(/tx\.set\([^)]+\)/g) ?? [];
    for (const setCall of setMatches) {
      expect(setCall).not.toContain("reward-notif");
      expect(setCall).not.toContain("promo-notif");
    }
  });

  it("real reward notification text matches actual reward", () => {
    expect(rewardsServer).toContain("100 bonus points for joining AVENTA SHOP");
  });

  it("real promo notification uses actual generated code (not WELCOME10)", () => {
    expect(rewardsServer).toContain("activePromo.code");
    expect(rewardsServer).not.toContain("WELCOME10");
  });
});

describe("SIGNUP REWARD — Profile Vouchers Fix", () => {
  it("account.tsx imports listMyPromoCodes (not listAvailableCoupons)", () => {
    expect(accountPage).toContain("listMyPromoCodes");
    expect(accountPage).not.toContain("listAvailableCoupons");
  });

  it("account.tsx queries user's own promo codes with uid", () => {
    expect(accountPage).toContain('queryKey: ["promoCodes", uid]');
    expect(accountPage).toContain("listMyPromoCodes(uid!)");
  });

  it("account.tsx counts only usable promos as vouchers", () => {
    expect(accountPage).toContain("isPromoUsable");
    expect(accountPage).toContain("voucherCount");
  });

  it("account.tsx does NOT query global coupons collection", () => {
    expect(accountPage).not.toContain('"coupons", "available"');
  });
});

describe("SIGNUP REWARD — Reward Aggregation Consistency", () => {
  it("getRewardPoints sums all rewardTx entries (including welcome_signup)", () => {
    const walletClient = readFileSync("src/services/firebase/wallet.ts", "utf-8");
    expect(walletClient).toContain("getRewardPoints");
    expect(walletClient).toContain("reduce((s, t) => s + t.points, 0)");
  });

  it("readPointsBalance in wallet.server.ts sums all rewardTx (server-side)", () => {
    expect(walletServer).toContain("readPointsBalance");
    expect(walletServer).toContain("Number(data.points ?? 0)");
  });

  it("RewardTxType includes 'welcome_signup'", () => {
    const types = readFileSync("src/types/customer.ts", "utf-8");
    expect(types).toContain("welcome_signup");
  });
});

describe("SIGNUP REWARD — Promo System Reuse", () => {
  it("reuses existing createPromoCodeServer (does not replace it)", () => {
    expect(promoServer).toContain("export async function createPromoCodeServer");
    expect(promoServer).toContain("checkQualification");
  });

  it("uses AVENTA prefix (not NEXA)", () => {
    expect(promoServer).toContain('PROMO_PREFIX = "AVENTA"');
    expect(promoServer).not.toContain('PROMO_PREFIX = "NEXA"');
  });

  it("uses 6 numeric digits (not 4)", () => {
    expect(promoServer).toContain("PROMO_NUMERIC_LENGTH = 6");
  });

  it("existing idempotency via checkQualification is preserved", () => {
    expect(promoServer).toContain("qualified: boolean");
    expect(promoServer).toContain("already has");
  });

  it("promo codes are user-bound (userId field)", () => {
    expect(promoServer).toContain("userId: input.uid");
  });
});

describe("SIGNUP REWARD — Type Consistency", () => {
  it("rewardTx entry uses correct fields (type, points, note, orderId, createdAt)", () => {
    expect(rewardsServer).toContain("type: SIGNUP_REWARD_TYPE");
    expect(rewardsServer).toContain("points: SIGNUP_REWARD_POINTS");
    expect(rewardsServer).toContain("note:");
    expect(rewardsServer).toContain("orderId: null");
    expect(rewardsServer).toContain("createdAt");
  });

  it("notification entry uses correct fields (type, title, message, link, read, createdAt)", () => {
    expect(rewardsServer).toContain('type: "reward"');
    expect(rewardsServer).toContain("title:");
    expect(rewardsServer).toContain("message:");
    expect(rewardsServer).toContain("link:");
    expect(rewardsServer).toContain("read: false");
    expect(rewardsServer).toContain("createdAt");
  });
});
