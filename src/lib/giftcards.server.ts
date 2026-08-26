/**
 * Server-side gift card purchase logic.
 *
 * Runs only inside a server function handler. Uses the service account to
 * talk to the Firestore REST API (bypassing security rules), so the wallet
 * balance is computed from authoritative data and the gift card creation +
 * wallet deduction happen atomically in a single commit.
 */
import {
  batchGetDocs,
  commitWrites,
  docPath,
  getAccessToken,
  getProjectId,
  newDocId,
  toFsFields,
  fromFsFields,
  type FsValue,
} from "./firebase-admin.server";

const GIFT_CARDS_COLLECTION = "giftCards";
const WALLET_TX_SUBCOLLECTION = "walletTx";
const GIFT_CARD_PURCHASES_SUBCOLLECTION = "giftCardPurchases";
const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 100_000;

export interface PurchaseGiftCardServerInput {
  uid: string;
  email: string | null;
  amount: number;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
  theme: string;
}

export interface PurchaseGiftCardServerResult {
  code: string;
  giftCardId: string;
  amount: number;
}

/** Read a user's wallet balance from the authoritative ledger. */
async function readWalletBalance(
  projectId: string,
  uid: string,
): Promise<number> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: { from: [{ collectionId: WALLET_TX_SUBCOLLECTION }], limit: 1000 },
      }),
    },
  );
  if (!res.ok) throw new Error("Could not read your wallet balance. Please try again.");
  const json = (await res.json()) as Array<{
    document?: { fields?: Record<string, FsValue> };
  }>;
  let balance = 0;
  for (const row of json) {
    if (!row.document) continue;
    const data = fromFsFields(row.document.fields ?? {});
    balance += Number(data.amount ?? 0);
  }
  return Math.round(balance * 100) / 100;
}

/** Generate a cryptographically random gift card code. */
function generateGiftCardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let code = "AVT-";
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  code += "-";
  for (let i = 6; i < 10; i++) code += chars[bytes[i] % chars.length];
  return code;
}

/** Check code uniqueness against Firestore. */
async function isCodeUnique(
  projectId: string,
  code: string,
): Promise<boolean> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${GIFT_CARDS_COLLECTION}:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: GIFT_CARDS_COLLECTION }],
          where: {
            fieldFilter: {
              field: { fieldPath: "code" },
              op: "EQUAL",
              value: { stringValue: code },
            },
          },
          limit: 1,
        },
      }),
    },
  );
  if (!res.ok) throw new Error("Could not verify gift card code. Please try again.");
  const json = (await res.json()) as Array<{ document?: unknown }>;
  return !json.some((r) => r.document);
}

/** Generate a code that is guaranteed unique (retry up to 5 times). */
async function generateUniqueCode(projectId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateGiftCardCode();
    if (await isCodeUnique(projectId, code)) return code;
  }
  throw new Error("Could not generate a unique gift card code. Please try again.");
}

/**
 * Purchases a gift card server-side.
 *
 * 1. Validates the amount.
 * 2. Reads the user's real wallet balance from Firestore.
 * 3. Verifies sufficient balance.
 * 4. Generates a unique gift card code.
 * 5. Atomically commits: wallet debit + gift card creation + purchase ledger.
 *
 * All three writes are in a single Firestore commit — either all succeed or
 * all fail. No partial state is possible.
 */
export async function purchaseGiftCardServer(
  input: PurchaseGiftCardServerInput,
): Promise<PurchaseGiftCardServerResult> {
  const projectId = getProjectId();

  // 1. Validate amount
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Please enter a valid amount.");
  }
  if (amount < MIN_AMOUNT) {
    throw new Error(`Minimum gift card amount is \u{09F3}${MIN_AMOUNT}.`);
  }
  if (amount > MAX_AMOUNT) {
    throw new Error(`Maximum gift card amount is \u{09F3}${MAX_AMOUNT}.`);
  }

  // 2. Validate recipient
  if (!input.recipientName || input.recipientName.trim().length < 1) {
    throw new Error("Please enter the recipient's name.");
  }
  if (!input.recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipientEmail)) {
    throw new Error("Please enter a valid recipient email.");
  }

  // 3. Read real wallet balance server-side
  const walletBalance = await readWalletBalance(projectId, input.uid);
  if (walletBalance < amount) {
    throw new Error(
      `Insufficient wallet balance. You have \u{09F3}${walletBalance.toFixed(0)} but need \u{09F3}${amount.toFixed(0)}.`,
    );
  }

  // 4. Generate unique code
  const code = await generateUniqueCode(projectId);

  // 5. Prepare atomic writes
  const now = new Date().toISOString();
  const expiresAt = Date.now() + EXPIRY_MS;
  const giftCardId = newDocId();
  const purchaseId = newDocId();

  const writes = [
    // Gift card document (top-level collection)
    {
      update: {
        name: docPath(projectId, [GIFT_CARDS_COLLECTION, giftCardId]),
        fields: toFsFields({
          code,
          amount,
          balance: amount,
          senderName: input.senderName,
          senderEmail: input.senderEmail,
          recipientName: input.recipientName.trim(),
          recipientEmail: input.recipientEmail.trim(),
          message: input.message || "",
          theme: input.theme || "classic",
          status: "active",
          uid: input.uid,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        }),
      },
      currentDocument: { exists: false },
    },
    // Wallet debit (negative entry in the user's wallet ledger)
    {
      update: {
        name: docPath(projectId, [
          "users",
          input.uid,
          WALLET_TX_SUBCOLLECTION,
          newDocId(),
        ]),
        fields: toFsFields({
          type: "gift_card_purchase",
          amount: -amount,
          note: `Gift card purchase (${code}) for ${input.recipientName.trim()}`,
          giftCardId,
          giftCardCode: code,
          createdAt: now,
        }),
      },
      currentDocument: { exists: false },
    },
    // Purchase record (user's gift card purchases subcollection)
    {
      update: {
        name: docPath(projectId, [
          "users",
          input.uid,
          GIFT_CARD_PURCHASES_SUBCOLLECTION,
          purchaseId,
        ]),
        fields: toFsFields({
          giftCardId,
          code,
          amount,
          recipientName: input.recipientName.trim(),
          recipientEmail: input.recipientEmail.trim(),
          message: input.message || "",
          status: "purchased",
          createdAt: now,
        }),
      },
      currentDocument: { exists: false },
    },
  ];

  // 6. Atomically commit all writes
  await commitWrites(projectId, writes);

  return { code, giftCardId, amount };
}
