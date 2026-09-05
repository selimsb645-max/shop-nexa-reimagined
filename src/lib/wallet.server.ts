import {
  commitWrites,
  docPath,
  getAccessToken,
  getProjectId,
  newDocId,
  toFsFields,
  fromFsFields,
  type FsValue,
} from "./firebase-admin.server";

export const POINTS_PER_CURRENCY_REDEEM = 100;

/** Sum a user's reward-points ledger server side. */
async function readPointsBalance(projectId: string, uid: string): Promise<number> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: { from: [{ collectionId: "rewardTx" }], limit: 1000 },
      }),
    },
  );
  if (!res.ok) throw new Error("Could not read your reward points. Please try again.");
  const json = (await res.json()) as Array<{ document?: { fields?: Record<string, FsValue> } }>;
  let total = 0;
  for (const row of json) {
    if (!row.document) continue;
    const data = fromFsFields(row.document.fields ?? {});
    total += Number(data.points ?? 0);
  }
  return Math.round(total);
}

function ledgerWrite(
  projectId: string,
  uid: string,
  collectionId: "rewardTx" | "walletTx",
  fields: Record<string, unknown>,
) {
  return {
    update: {
      name: docPath(projectId, ["users", uid, collectionId, newDocId()]),
      fields: toFsFields({ ...fields, createdAt: new Date().toISOString() }),
    },
    currentDocument: { exists: false },
  };
}

/**
 * Redeems reward points into wallet credit. The available balance is recomputed
 * from the server-side ledger, so a client can never credit itself.
 */
export async function redeemPointsServer(
  uid: string,
  points: number,
): Promise<{ credit: number; remainingPoints: number }> {
  const projectId = getProjectId();
  if (!Number.isInteger(points) || points <= 0)
    throw new Error("Enter the points you want to redeem");
  if (points % POINTS_PER_CURRENCY_REDEEM !== 0)
    throw new Error(`Redeem in multiples of ${POINTS_PER_CURRENCY_REDEEM} points`);

  const available = await readPointsBalance(projectId, uid);
  if (points > available) throw new Error("You do not have enough points");

  const credit = Math.round((points / POINTS_PER_CURRENCY_REDEEM) * 100) / 100;

  await commitWrites(projectId, [
    ledgerWrite(projectId, uid, "rewardTx", {
      type: "redeem",
      points: -points,
      note: `Redeemed ${points} points for wallet credit`,
      orderId: null,
    }),
    ledgerWrite(projectId, uid, "walletTx", {
      type: "topup",
      amount: credit,
      note: `Reward redemption (${points} points)`,
      orderId: null,
    }),
  ]);

  return { credit, remainingPoints: available - points };
}

/**
 * Applies a referral: writes the referrer's referral record, stamps the new
 * user's `referredBy` and credits their one-time welcome points. All of it runs
 * server side so the balance-affecting fields can never be forged by a client.
 */
export const REFERRAL_BONUS_POINTS = 500;
export const REFERRAL_WELCOME_POINTS = 250;

/** Deterministic referral code derived from a uid (mirrors the client helper). */
function referralCodeForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) % 2176782336; // 36^6
  }
  return `NEXA${hash.toString(36).toUpperCase().padStart(6, "0")}`;
}

/**
 * SECURITY: resolves the owner of a referral code entirely server side so a
 * caller can never nominate an arbitrary referrer uid.
 */
async function resolveReferrerId(
  projectId: string,
  token: string,
  code: string,
): Promise<string | null> {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "users" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "referralCode" },
              op: "EQUAL",
              value: { stringValue: code },
            },
          },
          limit: 1,
        },
      }),
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as Array<{ document?: { name?: string } }>;
  const name = json.find((r) => r.document?.name)?.document?.name;
  if (!name) return null;
  const uid = name.split("/").pop() ?? "";
  // Double-check the stored code really belongs to that uid.
  if (!uid || referralCodeForUid(uid) !== code) return null;
  return uid;
}

export async function applyReferralServer(input: {
  uid: string;
  displayName: string | null;
  code: string;
}): Promise<{ points: number }> {
  const projectId = getProjectId();
  const code = input.code.trim().toUpperCase();
  const token = await getAccessToken();

  // SECURITY: derive the referrer from the code — never trust a client-supplied id.
  const referrerId = await resolveReferrerId(projectId, token, code);
  if (!referrerId) throw new Error("Referral code not found");
  if (referrerId === input.uid) throw new Error("You cannot use your own code");

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(input.uid)}:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "rewardTx" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "type" },
              op: "EQUAL",
              value: { stringValue: "referral" },
            },
          },
          limit: 1,
        },
      }),
    },
  );
  if (!res.ok) throw new Error("Could not apply the referral code. Please try again.");
  const json = (await res.json()) as Array<{ document?: unknown }>;
  if (json.some((r) => r.document)) throw new Error("You have already used a referral code");

  const now = new Date().toISOString();
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, ["users", referrerId, "referrals", input.uid]),
        fields: toFsFields({
          referredUserId: input.uid,
          referredName: input.displayName ?? "New customer",
          status: "joined",
          bonusPoints: REFERRAL_BONUS_POINTS,
          createdAt: now,
        }),
      },
    },
    {
      update: {
        name: docPath(projectId, ["users", input.uid]),
        fields: toFsFields({ referredBy: code, updatedAt: now }),
      },
      updateMask: { fieldPaths: ["referredBy", "updatedAt"] },
    },
    ledgerWrite(projectId, input.uid, "rewardTx", {
      type: "referral",
      points: REFERRAL_WELCOME_POINTS,
      note: `Welcome bonus for joining with ${code}`,
      orderId: null,
    }),
  ]);

  return { points: REFERRAL_WELCOME_POINTS };
}
