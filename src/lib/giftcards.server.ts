/**
 * Server-side gift card purchase logic — transaction-safe.
 *
 * Uses a true Firestore transaction (optimistic concurrency control) so two
 * simultaneous purchases cannot spend the same wallet balance. The user
 * document is read within the transaction as a "lock" — any concurrent
 * wallet-affecting write to the user document will cause the other
 * transaction to abort and retry with fresh data.
 */
import {
  batchGetDocsWithTx,
  beginTransaction,
  commitWithTx,
  rollbackTransaction,
  getAccessToken,
  getProjectId,
  newDocId,
  toFsFields,
  fromFsFields,
  docPath,
  type FsValue,
  type FetchedDoc,
} from "./firebase-admin.server";

const GIFT_CARDS_COLLECTION = "giftCards";
const WALLET_TX_SUBCOLLECTION = "walletTx";
const GIFT_CARD_PURCHASES_SUBCOLLECTION = "giftCardPurchases";
const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 100_000;
const MAX_TX_RETRIES = 5;

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

/**
 * Read a user's wallet balance from the authoritative ledger.
 * Used outside transactions for display/balance-check purposes.
 */
async function readWalletBalanceOutsideTx(
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

/**
 * Read wallet balance *within* a transaction using batchGet.
 * Reads all walletTx documents by their document names.
 *
 * Note: We cannot run structured queries inside a Firestore REST transaction.
 * We must read individual documents by name. To get the names, we first run
 * a query outside the transaction to list walletTx document IDs, then read
 * those documents within the transaction. This is safe because:
 *
 * 1. The user document is also read within the transaction (as the lock).
 * 2. If a concurrent transaction adds a new walletTx and updates the user
 *    document, our commit will fail (user doc changed) and we retry.
 * 3. On retry, we re-query walletTx IDs (now including the new entry) and
 *    re-read them within the new transaction.
 */
async function listWalletTxDocIds(projectId: string, uid: string): Promise<string[]> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: WALLET_TX_SUBCOLLECTION }],
          // Only need the document names, not fields
          select: { fields: [{ fieldPath: "__name__" }] },
          limit: 1000,
        },
      }),
    },
  );
  if (!res.ok) throw new Error("Could not read wallet data. Please try again.");
  const json = (await res.json()) as Array<{
    document?: { name?: string };
  }>;
  const names: string[] = [];
  for (const row of json) {
    if (row.document?.name) names.push(row.document.name);
  }
  return names;
}

/** Calculate balance from fetched walletTx documents. */
function calculateBalanceFromDocs(docs: Map<string, FetchedDoc>): number {
  let balance = 0;
  for (const doc of docs.values()) {
    if (!doc.exists) continue;
    const amount = Number(doc.data.amount ?? 0);
    balance += amount;
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

/** Check code uniqueness against Firestore (outside transaction). */
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
 * Purchases a gift card using a Firestore transaction.
 *
 * CONCURRENCY GUARANTEE:
 * The user document (users/{uid}) is read within the transaction as a "lock".
 * Any concurrent wallet-affecting write (including another gift card purchase)
 * also writes to the user document. This causes conflicting transactions to
 * abort and retry with fresh data, preventing double-spending.
 *
 * FLOW (per transaction attempt):
 * 1. Begin transaction
 * 2. Read user document (users/{uid}) — this is the lock
 * 3. Read all walletTx documents for the user
 * 4. Calculate current balance from the ledger
 * 5. If balance < amount → rollback, throw "Insufficient balance"
 * 6. Generate gift card code (outside tx)
 * 7. Prepare writes: gift card + wallet debit + purchase record + user doc update
 * 8. Commit (fails with ABORTED if user doc was modified by another tx)
 * 9. If ABORTED, retry from step 1
 *
 * GUARANTEES:
 * - Two simultaneous purchases cannot spend the same balance
 * - Balance can never go negative
 * - Exactly one of two conflicting purchases succeeds
 * - All writes succeed or fail atomically
 */
export async function purchaseGiftCardServer(
  input: PurchaseGiftCardServerInput,
): Promise<PurchaseGiftCardServerResult> {
  const projectId = getProjectId();

  // --- Pre-transaction validation (fail fast, no Firestore reads needed) ---
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
  if (!input.recipientName || input.recipientName.trim().length < 1) {
    throw new Error("Please enter the recipient's name.");
  }
  if (!input.recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipientEmail)) {
    throw new Error("Please enter a valid recipient email.");
  }

  // Pre-check balance outside transaction (for fast failure, not security-critical)
  const preCheckBalance = await readWalletBalanceOutsideTx(projectId, input.uid);
  if (preCheckBalance < amount) {
    throw new Error(
      `Insufficient wallet balance. You have \u{09F3}${preCheckBalance.toFixed(0)} but need \u{09F3}${amount.toFixed(0)}.`,
    );
  }

  // --- Generate code outside transaction (uniqueness is checked separately) ---
  // We regenerate on each retry in case of collision.
  const code = await generateUniqueCode(projectId);
  const giftCardId = newDocId();

  // --- Run the purchase in a Firestore transaction with retry ---
  let lastError: Error | null = null;
  let txResult: { code: string; giftCardId: string; amount: number } | null = null;

  for (let attempt = 0; attempt <= MAX_TX_RETRIES; attempt++) {
    // Generate a fresh code on retry (in case the previous one was used)
    const attemptCode = attempt === 0 ? code : await generateUniqueCode(projectId);
    const attemptGiftCardId = attempt === 0 ? giftCardId : newDocId();

    let tx: string | null = null;
    try {
      // 1. Begin transaction
      tx = await beginTransaction(projectId);

      // 2. Read user document (the "lock" document for concurrency control)
      const userDocName = docPath(projectId, ["users", input.uid]);

      // 3. List walletTx document IDs (outside tx — just for names)
      const walletTxNames = await listWalletTxDocIds(projectId, input.uid);

      // 4. Read user doc + all walletTx docs WITHIN the transaction
      const allNames = [userDocName, ...walletTxNames];
      const docs = await batchGetDocsWithTx(projectId, allNames, tx);

      // 5. Calculate balance from transaction-locked reads
      const walletBalance = calculateBalanceFromDocs(
        new Map(
          Array.from(docs.entries()).filter(
            ([name]) => name !== userDocName,
          ),
        ),
      );

      // 6. Check balance — this is the CRITICAL concurrency-safe check
      if (walletBalance < amount) {
        await rollbackTransaction(projectId, tx);
        throw new Error(
          `Insufficient wallet balance. You have \u{09F3}${walletBalance.toFixed(0)} but need \u{09F3}${amount.toFixed(0)}.`,
        );
      }

      // 7. Prepare atomic writes
      const now = new Date().toISOString();
      const expiresAt = Date.now() + EXPIRY_MS;
      const purchaseId = newDocId();

      const writes = [
        // Gift card document (top-level collection)
        {
          update: {
            name: docPath(projectId, [GIFT_CARDS_COLLECTION, attemptGiftCardId]),
            fields: toFsFields({
              code: attemptCode,
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
              note: `Gift card purchase (${attemptCode}) for ${input.recipientName.trim()}`,
              giftCardId: attemptGiftCardId,
              giftCardCode: attemptCode,
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
              giftCardId: attemptGiftCardId,
              code: attemptCode,
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
        // User document update (the "lock release" — bumps walletTxVersion
        // so any concurrent transaction reading the same user doc will abort)
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

      // 8. Commit within the transaction
      const committed = await commitWithTx(projectId, writes, tx);
      if (committed) {
        txResult = { code: attemptCode, giftCardId: attemptGiftCardId, amount };
        break;
      }

      // 9. ABORTED — concurrent transaction modified our reads. Retry.
      lastError = new Error(
        "Another transaction modified your wallet. Retrying...",
      );
    } catch (err) {
      if (tx) await rollbackTransaction(projectId, tx);
      throw err; // Non-retryable error
    }
  }

  if (!txResult) {
    throw lastError ?? new Error("Purchase failed after multiple retries. Please try again.");
  }

  return txResult;
}
