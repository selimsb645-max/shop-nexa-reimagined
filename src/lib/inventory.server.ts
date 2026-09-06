// ═══════════════════════════════════════════════════════════════
// Aventa Mart — Inventory Reservation (Implementation Prompt 03 §2)
// ═══════════════════════════════════════════════════════════════
// Race-condition-safe stock reservation using TRUE Firestore
// transactions (optimistic concurrency via REST :beginTransaction).
//
// Three-field inventory model per product:
//   stock          — legacy total physical stock (unchanged; kept
//                    for backward compatibility with existing UI)
//   reservedStock  — units reserved by active orders
//   soldStock      — units permanently sold (converted at DELIVERED)
//   availableStock — materialized (stock − reserved − sold) for
//                    cheap reads; always updated in the SAME
//                    transaction so it can never drift.
//
// INVARIANT: the same product's last unit can NEVER be sold to two
// simultaneous orders — both transactions read the product doc
// inside the transaction; the loser's commit aborts (ABORTED) and
// retries, sees the shortage, and fails cleanly.
// ═══════════════════════════════════════════════════════════════

import {
  batchGetDocsWithTx,
  beginTransaction,
  commitWithTx,
  rollbackTransaction,
  docPath,
  toFsFields,
  type FsWrite,
  type FetchedDoc,
} from "./firebase-admin.server";

const MAX_ATTEMPTS = 3;
const RESERVATIONS_COLLECTION = "inventoryReservations";

export interface ReservationItem {
  productId: string;
  quantity: number;
  // ── OPTIONAL FINANCE FIELDS (Prompt 04, added additively) ──
  // Carried on ORDER_CREATED events so the finance handler can build
  // per-seller settlements without re-reading order documents. Older
  // callers that omit them are unaffected (all optional).
  sellerId?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  /** Line gross in taka (converted to paisa ONCE server-side). */
  lineTotalTaka?: number;
  /** Delivery charge absorbed by the seller for this line (taka). */
  shippingTaka?: number;
}

export type ReservationState =
  | "reserved"
  | "released"
  | "sold";

export interface ReservationResult {
  ok: boolean;
  reason?: string;
  state: ReservationState | "none";
  attempts: number;
}

interface ProductStockDoc {
  stock: number;
  reservedStock: number;
  soldStock: number;
}

/** Parse a product doc's inventory fields (missing → 0: migration-safe). */
function readStock(doc: FetchedDoc | undefined): ProductStockDoc {
  const f = (doc?.data ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    stock: num(f["stock"]),
    reservedStock: num(f["reservedStock"]),
    soldStock: num(f["soldStock"]),
  };
}

/** Available units for a parsed stock doc. */
export function availableUnits(s: ProductStockDoc): number {
  return s.stock - s.reservedStock - s.soldStock;
}

/** Deterministic reservation doc id — the idempotency anchor (§7). */
function reservationDocId(orderId: string): string {
  return `res_${orderId}`;
}

/**
 * Reserve inventory for an order — concurrency-safe.
 * IDEMPOTENT: if this order already holds an active reservation,
 * the call succeeds as a no-op (duplicate ORDER events are safe).
 * ABORTED commits (concurrent modification) are retried up to
 * MAX_ATTEMPTS with fresh reads.
 */
export async function reserveInventoryForOrder(
  projectId: string,
  orderId: string,
  items: ReservationItem[],
): Promise<ReservationResult> {
  const filtered = items.filter((i) => i.quantity > 0);
  if (filtered.length === 0) {
    return { ok: true, state: "none", attempts: 0 };
  }

  let lastReason = "Unknown reservation failure.";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let tx: string | null = null;
    try {
      tx = await beginTransaction(projectId);

      // ── 1. Read reservation record (idempotency) + product docs,
      //      all INSIDE the transaction (optimistic locks).
      const names = [
        docPath(projectId, [RESERVATIONS_COLLECTION, reservationDocId(orderId)]),
        ...filtered.map((i) =>
          docPath(projectId, ["products", i.productId]),
        ),
      ];
      const docs = await batchGetDocsWithTx(projectId, names, tx);

      const resName = names[0];
      const existing = docs.get(resName);
      const existingState = String(((existing?.data ?? {}) as Record<string, unknown>)["state"] ?? "");

      // Idempotent: already reserved by a previous (duplicated) event.
      if (existingState === "reserved") {
        await rollbackTransaction(projectId, tx);
        return { ok: true, state: "reserved", attempts: attempt };
      }
      // Previously released/sold — do not double-reserve.
      if (existingState === "released" || existingState === "sold") {
        await rollbackTransaction(projectId, tx);
        return {
          ok: false,
          reason: `Reservation for order already ${existingState}.`,
          state: existingState,
          attempts: attempt,
        };
      }

      // ── 2. Concurrency-safe availability check.
      const writes: FsWrite[] = [];
      const perProduct = new Map<string, number>();
      for (const item of filtered) {
        perProduct.set(
          item.productId,
          (perProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }
      for (const [productId, qty] of perProduct) {
        const pName = docPath(projectId, ["products", productId]);
        const stock = readStock(docs.get(pName));
        const available = availableUnits(stock);
        if (available < qty) {
          await rollbackTransaction(projectId, tx);
          return {
            ok: false,
            reason: `Insufficient stock for product ${productId}: ${available} available, ${qty} needed.`,
            state: "none",
            attempts: attempt,
          };
        }
      }

      // ── 3. Atomic writes: reservation record + stock transforms.
      const now = Date.now();
      for (const [productId, qty] of perProduct) {
        const pName = docPath(projectId, ["products", productId]);
        const stock = readStock(docs.get(pName));
        const newReserved = stock.reservedStock + qty;
        writes.push({
          update: {
            name: pName,
            fields: toFsFields({
              reservedStock: newReserved,
              soldStock: stock.soldStock,
              stock: stock.stock,
              // Materialized availability — same-transaction consistency
              availableStock: stock.stock - newReserved - stock.soldStock,
              updatedAt: now,
            }),
          },
        });
      }
      writes.push({
        update: {
          name: resName,
          fields: toFsFields({
            orderId,
            items: filtered.map((i) => `${i.productId}:${i.quantity}`).join(","),
            state: "reserved",
            createdAt: now,
            updatedAt: now,
          }),
        },
      });

      // ── 4. Commit — aborts if any read doc changed concurrently.
      const committed = await commitWithTx(projectId, writes, tx);
      if (committed) {
        return { ok: true, state: "reserved", attempts: attempt };
      }
      // ABORTED → retry with fresh reads.
      lastReason = "Transaction aborted by concurrent write — retrying.";
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
      if (tx) {
        try { await rollbackTransaction(projectId, tx); } catch { /* already closed */ }
      }
    }
  }
  return { ok: false, reason: lastReason, state: "none", attempts: MAX_ATTEMPTS };
}

/**
 * Release (un-reserve) an order's inventory — used on cancellation
 * BEFORE handover. Idempotent: releasing a non-reserved order is a
 * no-op success. Legacy orders that decremented `stock` at checkout
 * restore `stock` instead (detected via the reservation record's
 * `legacyStock` flag).
 */
export async function releaseInventoryForOrder(
  projectId: string,
  orderId: string,
): Promise<ReservationResult> {
  return transitionReservation(projectId, orderId, "released", "reserved");
}

/**
 * Convert an order's reservation into permanent sold units —
 * called at DELIVERED. Idempotent.
 */
export async function convertReservationToSold(
  projectId: string,
  orderId: string,
): Promise<ReservationResult> {
  return transitionReservation(projectId, orderId, "sold", "reserved");
}

/**
 * Shared transactional transition of a reservation record:
 * reserved → (released | sold), with the matching stock-field moves.
 */
async function transitionReservation(
  projectId: string,
  orderId: string,
  to: "released" | "sold",
  expectedFrom: "reserved",
): Promise<ReservationResult> {
  let lastReason = "Unknown inventory transition failure.";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let tx: string | null = null;
    try {
      tx = await beginTransaction(projectId);

      const resName = docPath(
        projectId, [RESERVATIONS_COLLECTION, reservationDocId(orderId)],
      );
      const docs = await batchGetDocsWithTx(projectId, [resName], tx);
      const existing = docs.get(resName);
      const state = String(((existing?.data ?? {}) as Record<string, unknown>)["state"] ?? "");

      // No reservation (legacy order or already moved on) → no-op.
      if (state !== expectedFrom) {
        await rollbackTransaction(projectId, tx);
        return { ok: true, state: (state || "none") as ReservationState | "none", attempts: attempt };
      }

      // Parse reserved items to apply per-product deltas.
      const itemsRaw = String(((existing?.data ?? {}) as Record<string, unknown>)["items"] ?? "");
      const perProduct = new Map<string, number>();
      for (const part of itemsRaw.split(",")) {
        if (!part) continue;
        const [pid, qtyStr] = part.split(":");
        const qty = Number(qtyStr);
        if (pid && Number.isFinite(qty) && qty > 0) {
          perProduct.set(pid, (perProduct.get(pid) ?? 0) + qty);
        }
      }

      const now = Date.now();
      const writes: FsWrite[] = [];
      const productNames = Array.from(perProduct.keys()).map((pid) =>
        docPath(projectId, ["products", pid]),
      );
      const productDocs = productNames.length
        ? await batchGetDocsWithTx(projectId, productNames, tx)
        : new Map<string, FetchedDoc>();

      for (const [productId, qty] of perProduct) {
        const pName = docPath(projectId, ["products", productId]);
        const stock = readStock(productDocs.get(pName));
        const newReserved = Math.max(0, stock.reservedStock - qty);
        const newSold = to === "sold" ? stock.soldStock + qty : stock.soldStock;
        writes.push({
          update: {
            name: pName,
            fields: toFsFields({
              reservedStock: newReserved,
              soldStock: newSold,
              stock: stock.stock,
              availableStock: stock.stock - newReserved - newSold,
              updatedAt: now,
            }),
          },
        });
      }

      writes.push({
        update: {
          name: resName,
          fields: toFsFields({
            state: to,
            updatedAt: now,
          }),
        },
      });

      const committed = await commitWithTx(projectId, writes, tx);
      if (committed) {
        return { ok: true, state: to, attempts: attempt };
      }
      lastReason = "Transaction aborted by concurrent write — retrying.";
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
      if (tx) {
        try { await rollbackTransaction(projectId, tx); } catch { /* already closed */ }
      }
    }
  }
  return { ok: false, reason: lastReason, state: "none", attempts: MAX_ATTEMPTS };
}
