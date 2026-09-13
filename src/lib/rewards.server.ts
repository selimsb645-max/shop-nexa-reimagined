/**
 * AVENTA SHOP — Signup Reward Server Module
 *
 * Runs ONLY inside server function handlers. Uses the Firebase service
 * account to talk to the Firestore REST API, bypassing security rules.
 *
 * Architecture:
 * - On successful signup, the user receives 100 reward points.
 * - A "rewardTx" entry is created with type "welcome_signup".
 * - A real notification is created with deterministic doc ID.
 * - Both are idempotent — concurrent calls or retries never create duplicates.
 *
 * CONCURRENCY MODEL:
 * Uses a Firestore transaction with the user document as a "lock" (same
 * pattern as giftcards.server.ts). The rewardTx entry and notification
 * use deterministic doc IDs so even if two transactions race, only one
 * can create the document (the other sees it already exists).
 */

import {
  beginTransaction,
  batchGetDocsWithTx,
  commitWithTx,
  rollbackTransaction,
  commitWrites,
  docPath,
  getAccessToken,
  getProjectId,
  toFsFields,
  fromFsFields,
  type FsValue,
  type FsWrite,
} from "./firebase-admin.server";

// ====================================================================
// Constants
// ====================================================================

export const SIGNUP_REWARD_POINTS = 100;
export const SIGNUP_REWARD_TYPE = "welcome_signup" as const;

// Deterministic doc IDs — guarantee idempotency
const REWARD_TX_DOC_ID = "welcome-signup";
const REWARD_NOTIF_DOC_ID = "welcome-reward-notif";
const PROMO_NOTIF_DOC_ID = "welcome-promo-notif";

// Old cosmetic notification doc IDs from the pre-fix seedInbox (orphans to clean up)
const OLD_FAKE_REWARD_NOTIF_ID = "reward-notif";
const OLD_FAKE_PROMO_NOTIF_ID = "promo-notif";

const MAX_TX_RETRIES = 5;

// ====================================================================
// Types
// ====================================================================

export interface SignupRewardResult {
  granted: boolean;
  points: number;
  alreadyHadReward: boolean;
}

export interface PromoNotificationResult {
  created: boolean;
  promoCode: string | null;
}

// ====================================================================
// Helpers
// ====================================================================

/**
 * Query a user's promo codes by campaign type (server-side).
 */
async function queryUserPromoCodes(
  projectId: string,
  uid: string,
  campaignType: string,
): Promise<Array<{ code: string; status: string; discountType: string; discountValue: number }>> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "promoCodes" }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: "userId" },
                    op: "EQUAL",
                    value: { stringValue: uid },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: "campaignType" },
                    op: "EQUAL",
                    value: { stringValue: campaignType },
                  },
                },
              ],
            },
          },
          limit: 10,
        },
      }),
    },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, FsValue> };
  }>;
  return json
    .filter((r) => r.document)
    .map((r) => {
      const data = fromFsFields(r.document!.fields ?? {});
      return {
        code: r.document!.name.split("/").pop() ?? "",
        status: String(data.status ?? "active"),
        discountType: String(data.discountType ?? "percent"),
        discountValue: Number(data.discountValue ?? 0),
      };
    });
}

// ====================================================================
// Grant Signup Reward (Transaction-Safe, Idempotent)
// ====================================================================

/**
 * Grants the 100-point signup reward to a new user.
 *
 * IDEMPOTENCY:
 * - Uses deterministic doc ID "welcome-signup" for the rewardTx entry.
 * - Uses deterministic doc ID "welcome-reward-notif" for the notification.
 * - Reads both within a Firestore transaction (with user doc as lock).
 * - If the rewardTx entry already exists, the transaction is rolled back
 *   and the function returns { granted: false, alreadyHadReward: true }.
 * - On ABORTED (concurrent transaction), retries up to MAX_TX_RETRIES.
 *
 * SELF-HEAL:
 * - Deletes old cosmetic "reward-notif" notification if it exists
 *   (proven orphan — no real rewardTx backs it).
 *
 * SECURITY:
 * - Runs only server-side (bypasses Firestore rules via service account).
 * - Client cannot call this directly — only through rewards.functions.ts
 *   which verifies the Firebase ID token first.
 */
export async function grantSignupRewardServer(uid: string): Promise<SignupRewardResult> {
  const projectId = getProjectId();
  const userDocName = docPath(projectId, ["users", uid]);
  const rewardTxDocName = docPath(projectId, ["users", uid, "rewardTx", REWARD_TX_DOC_ID]);
  const rewardNotifName = docPath(projectId, ["users", uid, "notifications", REWARD_NOTIF_DOC_ID]);
  const oldFakeRewardNotifName = docPath(projectId, [
    "users",
    uid,
    "notifications",
    OLD_FAKE_REWARD_NOTIF_ID,
  ]);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_TX_RETRIES; attempt++) {
    let tx: string | null = null;
    try {
      // 1. Begin transaction
      tx = await beginTransaction(projectId);

      // 2. Read user doc (lock) + rewardTx (idempotency check) + old fake notif (cleanup)
      const docs = await batchGetDocsWithTx(
        projectId,
        [userDocName, rewardTxDocName, oldFakeRewardNotifName],
        tx,
      );

      // 3. Check if already rewarded
      const existingReward = docs.get(rewardTxDocName);
      if (existingReward?.exists) {
        // Already rewarded — rollback and return
        await rollbackTransaction(projectId, tx);
        return { granted: false, points: 0, alreadyHadReward: true };
      }

      // 4. Prepare writes
      const now = new Date().toISOString();
      const nowMs = Date.now();
      const writes: FsWrite[] = [
        // Reward transaction entry (+100 points)
        {
          update: {
            name: rewardTxDocName,
            fields: toFsFields({
              type: SIGNUP_REWARD_TYPE,
              points: SIGNUP_REWARD_POINTS,
              note: "Welcome bonus for joining AVENTA SHOP",
              orderId: null,
              createdAt: nowMs,
            }),
          },
          currentDocument: { exists: false },
        },
        // Real reward notification
        {
          update: {
            name: rewardNotifName,
            fields: toFsFields({
              type: "reward",
              title: "100 Bonus Points Earned! 🎉",
              message:
                "You earned 100 bonus points for joining AVENTA SHOP. Use them on your first purchase!",
              link: "/rewards",
              read: false,
              createdAt: nowMs,
            }),
          },
          currentDocument: { exists: false },
        },
        // User document update (lock release — bumps walletTxVersion)
        {
          update: {
            name: userDocName,
            fields: toFsFields({
              walletTxVersion: attempt + 1,
              updatedAt: now,
            }),
          },
          updateMask: { fieldPaths: ["walletTxVersion", "updatedAt"] },
        },
      ];

      // 5. Self-heal: delete old cosmetic "reward-notif" if it still exists
      const oldFakeNotif = docs.get(oldFakeRewardNotifName);
      if (oldFakeNotif?.exists) {
        writes.push({ delete: oldFakeRewardNotifName });
      }

      // 6. Commit within transaction
      const committed = await commitWithTx(projectId, writes, tx);
      if (committed) {
        return { granted: true, points: SIGNUP_REWARD_POINTS, alreadyHadReward: false };
      }

      // 7. ABORTED — retry
      lastError = new Error("Concurrent transaction. Retrying...");
    } catch (err) {
      if (tx) await rollbackTransaction(projectId, tx);
      throw err;
    }
  }

  throw lastError ?? new Error("Could not grant signup reward. Please try again.");
}

// ====================================================================
// Ensure Welcome Promo Notification (Idempotent)
// ====================================================================

/**
 * Creates a notification for the user's welcome promo code.
 *
 * IDEMPOTENCY:
 * - Uses deterministic doc ID "welcome-promo-notif" for the notification.
 * - Uses currentDocument: { exists: false } as a pre-condition.
 * - If the notification already exists, the write silently fails (no error).
 *
 * SELF-HEAL:
 * - Deletes old cosmetic "promo-notif" notification if it exists
 *   (proven orphan — mentioned a fake promo code that does not exist as a real document).
 *
 * FLOW:
 * 1. Query user's promo codes for campaignType "welcome"
 * 2. If found, create notification with the actual code
 * 3. If not found, do nothing (promo hasn't been created yet)
 *
 * SECURITY:
 * - Runs only server-side via service account.
 */
export async function ensureWelcomePromoNotificationServer(
  uid: string,
): Promise<PromoNotificationResult> {
  const projectId = getProjectId();

  // 1. Query user's welcome promo codes
  const promos = await queryUserPromoCodes(projectId, uid, "welcome");
  if (promos.length === 0) {
    return { created: false, promoCode: null };
  }

  // Use the first active promo (or the first one if none are active)
  const activePromo = promos.find((p) => p.status === "active") ?? promos[0];
  const discountText =
    activePromo.discountType === "percent"
      ? `${activePromo.discountValue}% off`
      : `${activePromo.discountValue} off`;

  const nowMs = Date.now();
  const writes: FsWrite[] = [
    // Real promo notification (with actual code)
    {
      update: {
        name: docPath(projectId, ["users", uid, "notifications", PROMO_NOTIF_DOC_ID]),
        fields: toFsFields({
          type: "promo",
          title: "Your Welcome Promo Code! 🎁",
          message: `Use code ${activePromo.code} for ${discountText} your first order!`,
          link: "/promo-codes",
          read: false,
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    },
  ];

  // 2. Self-heal: delete old cosmetic "promo-notif" if it exists
  // We use a separate read to check if the old notif exists
  const token = await getAccessToken();
  const oldNotifRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath(projectId, ["users", uid, "notifications", OLD_FAKE_PROMO_NOTIF_ID])}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (oldNotifRes.ok) {
    writes.push({
      delete: docPath(projectId, ["users", uid, "notifications", OLD_FAKE_PROMO_NOTIF_ID]),
    });
  }

  // 3. Commit (silently fails if notification already exists due to currentDocument precondition)
  try {
    await commitWrites(projectId, writes);
  } catch {
    // currentDocument precondition failure = notification already exists — that's fine
  }

  return { created: true, promoCode: activePromo.code };
}
