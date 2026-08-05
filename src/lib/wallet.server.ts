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
export const REFERRAL_WELCOME_POINTS = 200;

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
 * Credits the one-time referral welcome bonus. Refuses if the user already has
 * a referral entry in their ledger.
 */
export async function creditReferralWelcomeServer(
  uid: string,
  code: string,
): Promise<{ points: number }> {
  const projectId = getProjectId();
  const token = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}:runQuery`,
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
  if (json.some((r) => r.document)) throw new Error("Referral bonus already claimed");

  await commitWrites(projectId, [
    ledgerWrite(projectId, uid, "rewardTx", {
      type: "referral",
      points: REFERRAL_WELCOME_POINTS,
      note: `Welcome bonus for joining with ${code.trim().toUpperCase()}`,
      orderId: null,
    }),
  ]);

  return { points: REFERRAL_WELCOME_POINTS };
}
