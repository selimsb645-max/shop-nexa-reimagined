/**
 * Seller Inventory Server Functions
 *
 * Inventory counters (stock, availableStock, reservedStock, soldStock)
 * are SERVER-CONTROLLED by Firestore security rules — no client SDK
 * write is allowed on `products.stock`, not even for the owning seller
 * (see firestore.rules `match /products/{id}` — defense-in-depth
 * against stock corruption, same rule that guards the order engine's
 * reserve/release/sold transitions in inventory.server.ts).
 *
 * The seller Inventory page's "Update stock" action therefore has to
 * go through this Admin-SDK-backed server function instead of a
 * direct client transaction (which the rules correctly reject with
 * "permission-denied").
 *
 * Sets the seller's declared total physical stock (`stock`) and keeps
 * the materialized `availableStock = stock - reservedStock - soldStock`
 * invariant intact in the SAME transaction, matching the model in
 * inventory.server.ts.
 */

import {
  verifyIdToken,
  getProjectId,
  docPath,
  toFsFields,
  batchGetDocs,
  beginTransaction,
  batchGetDocsWithTx,
  commitWithTx,
  rollbackTransaction,
  type FetchedDoc,
} from "./firebase-admin.server";

const PRODUCTS_COLLECTION = "products";
const MAX_ATTEMPTS = 3;

/** Verify the caller is an approved seller and return their uid. */
async function verifyApprovedSeller(projectId: string, idToken: string): Promise<string> {
  const { uid } = await verifyIdToken(idToken);
  const sellerPath = docPath(projectId, ["sellers", uid]);
  const docs = await batchGetDocs(projectId, [sellerPath]);
  const seller = docs.get(sellerPath);
  if (!seller || !seller.exists) {
    throw new Error("Seller profile not found. Please register as a seller.");
  }
  if (String((seller.data as Record<string, unknown>)["status"] ?? "") !== "approved") {
    throw new Error("Your seller account is not approved.");
  }
  return uid;
}

function readCounters(doc: FetchedDoc | undefined) {
  const f = (doc?.data ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    exists: !!doc?.exists,
    sellerId: String(f["sellerId"] ?? ""),
    title: String(f["title"] ?? ""),
    stock: num(f["stock"]),
    reservedStock: num(f["reservedStock"]),
    soldStock: num(f["soldStock"]),
  };
}

export interface RestockResult {
  previousStock: number;
  newStock: number;
  title: string;
}

/**
 * Seller sets the total physical stock for one of their own products.
 * Rejects if the new total would be lower than units already
 * reserved + permanently sold (that would make availableStock go
 * negative and corrupt the reservation invariant).
 */
export async function restockProductServer(
  idToken: string,
  productId: string,
  newStock: number,
): Promise<RestockResult> {
  if (!Number.isInteger(newStock) || newStock < 0) {
    throw new Error("Stock must be a whole number of 0 or more.");
  }

  const projectId = getProjectId();
  const sellerId = await verifyApprovedSeller(projectId, idToken);
  const productPath = docPath(projectId, [PRODUCTS_COLLECTION, productId]);

  let lastError: Error = new Error("Unable to update stock — please try again.");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let tx: string | null = null;
    try {
      tx = await beginTransaction(projectId);
      const docs = await batchGetDocsWithTx(projectId, [productPath], tx);
      const counters = readCounters(docs.get(productPath));

      if (!counters.exists) {
        await rollbackTransaction(projectId, tx);
        throw new Error("Product not found.");
      }
      if (counters.sellerId !== sellerId) {
        await rollbackTransaction(projectId, tx);
        throw new Error("Access denied: this product does not belong to you.");
      }
      const committedUnits = counters.reservedStock + counters.soldStock;
      if (newStock < committedUnits) {
        await rollbackTransaction(projectId, tx);
        throw new Error(
          `Stock can't be set below ${committedUnits} — that many units are already reserved or sold.`,
        );
      }

      const now = Date.now();
      const committed = await commitWithTx(
        projectId,
        [
          {
            update: {
              name: productPath,
              fields: toFsFields({
                stock: newStock,
                availableStock: newStock - committedUnits,
                updatedAt: now,
              }),
            },
          },
        ],
        tx,
      );

      if (committed) {
        return { previousStock: counters.stock, newStock, title: counters.title };
      }
      lastError = new Error("Stock update conflicted with another change — retrying.");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (
        lastError.message.includes("not found") ||
        lastError.message.includes("Access denied") ||
        lastError.message.includes("already reserved or sold")
      ) {
        throw lastError;
      }
      if (tx) {
        try {
          await rollbackTransaction(projectId, tx);
        } catch {
          /* already closed */
        }
      }
    }
  }
  throw lastError;
}
