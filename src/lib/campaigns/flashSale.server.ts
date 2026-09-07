/**
 * AVENTA SHOP — Flash Sale Engine (Prompt 05 §7)
 *
 * `flashSales/{campaignId}`:
 *   { campaignId, startAt, endAt, stockTotal, stockReserved,
 *     perCustomerLimit, salePriceMinor, originalPriceMinor, active }
 *
 * Stock deduction is CONCURRENCY-SAFE: every reservation is a Firestore
 * optimistic-lock transaction (read stock + customer purchase counter,
 * validate, write both) with retry-on-conflict — the same pattern the
 * finance ledger uses. Two simultaneous buyers for the last unit: one
 * wins, one gets SOLD_OUT. No oversell, ever.
 */
import {
  docPath,
  batchGetDocs,
  commitWrites,
  toFsFields,
  fromFsFields,
  beginTransaction,
  batchGetDocsWithTx,
  commitWithTx,
  rollbackTransaction,
  runFirestoreQuery,
} from "../firebase-admin.server";
import { validateCampaignPricing, type DiscountRules } from "./pricing";
import { appendAuditEntry, type EventActor } from "../kernel/audit";

export const FLASH_SALES_COLLECTION = "flashSales";
export const FLASH_SALE_PURCHASES_COLLECTION = "flashSalePurchases";

const MAX_ATTEMPTS = 5;

export interface FlashSaleDoc {
  campaignId: string;
  /**
   * The product this flash sale sells (reserve→order integration).
   * null on legacy docs — such sales never match at checkout.
   */
  productId: string | null;
  startAt: number;
  endAt: number;
  stockTotal: number;
  stockReserved: number;
  perCustomerLimit: number;
  salePriceMinor: number;
  originalPriceMinor: number;
  active: boolean;
}

export interface CreateFlashSaleInput {
  campaignId: string;
  /** Required for checkout integration — a sale must sell a product. */
  productId?: string | null;
  startAt: number;
  endAt: number;
  stockLimit: number;
  perCustomerLimit: number;
  originalPriceMinor: number;
  salePriceMinor: number;
}

export async function createFlashSale(
  projectId: string,
  input: CreateFlashSaleInput,
  opts: AdminOpOpts = {},
): Promise<FlashSaleDoc> {
  if (input.stockLimit < 1) throw new Error("flashsale/validation: stockLimit must be >= 1");
  if (input.perCustomerLimit < 1)
    throw new Error("flashsale/validation: perCustomerLimit must be >= 1");
  if (input.endAt <= input.startAt)
    throw new Error("flashsale/validation: endAt must be after startAt");
  // Reserve→order integration: a sale bound to no product can never
  // be applied at checkout — reject empty strings, keep null (legacy).
  if (input.productId !== undefined && input.productId !== null) {
    if (typeof input.productId !== "string" || !input.productId.trim()) {
      throw new Error("flashsale/validation: productId must be a non-empty string");
    }
  }
  // Price safety (§6): sale price must be a valid discount of the original.
  const { result } = validateCampaignPricing(
    input.originalPriceMinor,
    { type: "PRICE_OVERRIDE", valueMinor: input.salePriceMinor },
    null,
  );
  if (!result.ok) throw new Error(`flashsale/validation: ${result.errors.join("; ")}`);

  const doc0 = {
    productId: input.productId?.trim() ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
  };
  // Option-A conflict prevention (Flash Sale Scheduling spec): the
  // same product must never have two overlapping ACTIVE sale windows
  // — pricing ambiguity is rejected at write time. The checkout-side
  // soonest-endAt precedence stays as defense-in-depth for legacy data.
  if (doc0.productId && !opts.allowOverlap) {
    const conflict = await findFlashSaleConflict(projectId, {
      productId: doc0.productId,
      startAt: doc0.startAt,
      endAt: doc0.endAt,
      excludeCampaignId: input.campaignId,
    });
    if (conflict) {
      throw new Error(
        `flashsale/conflict: product ${doc0.productId} already has an overlapping active flash sale (campaign ${conflict})`,
      );
    }
  }

  const doc: FlashSaleDoc = {
    campaignId: input.campaignId,
    productId: doc0.productId,
    startAt: doc0.startAt,
    endAt: doc0.endAt,
    stockTotal: input.stockLimit,
    stockReserved: 0,
    perCustomerLimit: input.perCustomerLimit,
    salePriceMinor: input.salePriceMinor,
    originalPriceMinor: input.originalPriceMinor,
    active: true,
  };
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [FLASH_SALES_COLLECTION, input.campaignId]),
        fields: toFsFields({ ...doc } as Record<string, unknown>),
      },
    },
  ]);
  if (opts.actor) {
    await appendAuditEntry(projectId, {
      actor: opts.actor,
      action: "FLASH_SALE_CREATED",
      target: `flashSales/${input.campaignId}`,
      meta: { productId: doc.productId, startAt: doc.startAt, endAt: doc.endAt },
    });
  }
  return doc;
}

export async function getFlashSale(
  projectId: string,
  campaignId: string,
): Promise<FlashSaleDoc | null> {
  const docs = await batchGetDocs(projectId, [
    docPath(projectId, [FLASH_SALES_COLLECTION, campaignId]),
  ]);
  const d = docs.get(docPath(projectId, [FLASH_SALES_COLLECTION, campaignId]));
  if (!d?.exists) return null;
  return d.data as Record<string, unknown> as unknown as FlashSaleDoc;
}

export type ReserveResult =
  | { ok: true; reserved: number; stockRemaining: number }
  | { ok: false; code: "SOLD_OUT" | "CUSTOMER_LIMIT" | "NOT_ACTIVE" | "NOT_FOUND" };

export interface ReserveInput {
  campaignId: string;
  customerId: string;
  quantity: number;
  now?: number;
}

/**
 * Concurrency-safe stock reservation (§7). Optimistic-lock transaction:
 * read flash sale + per-customer purchase counter → validate window,
 * stock, and per-customer limit → write both counters atomically.
 * Conflicts (concurrent buyers) abort and retry up to MAX_ATTEMPTS.
 */
export async function reserveFlashSaleStock(
  projectId: string,
  input: ReserveInput,
): Promise<ReserveResult> {
  if (input.quantity < 1) throw new Error("flashsale/validation: quantity must be >= 1");
  const now = input.now ?? Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let tx: string | null = null;
    try {
      tx = await beginTransaction(projectId);
      const saleName = docPath(projectId, [FLASH_SALES_COLLECTION, input.campaignId]);
      const purchaseName = docPath(projectId, [
        FLASH_SALE_PURCHASES_COLLECTION,
        `${input.campaignId}_${input.customerId}`,
      ]);
      const docs = await batchGetDocsWithTx(projectId, [saleName, purchaseName], tx);

      const saleDoc = docs.get(saleName);
      if (!saleDoc?.exists) return { ok: false, code: "NOT_FOUND" };
      const sale = saleDoc.data as Record<string, unknown> as unknown as FlashSaleDoc;
      if (!sale.active || now < sale.startAt || now >= sale.endAt) {
        await rollbackTransaction(projectId, tx);
        return { ok: false, code: "NOT_ACTIVE" };
      }

      const purchaseDoc = docs.get(purchaseName);
      const purchased = purchaseDoc?.exists
        ? Number((purchaseDoc.data as Record<string, unknown> as Record<string, unknown>)["qty"])
        : 0;
      if (purchased + input.quantity > sale.perCustomerLimit) {
        await rollbackTransaction(projectId, tx);
        return { ok: false, code: "CUSTOMER_LIMIT" };
      }
      if (sale.stockReserved + input.quantity > sale.stockTotal) {
        await rollbackTransaction(projectId, tx);
        return { ok: false, code: "SOLD_OUT" };
      }

      const writes = [
        {
          update: {
            name: saleName,
            fields: toFsFields({
              ...sale,
              stockReserved: sale.stockReserved + input.quantity,
            } as Record<string, unknown>),
          },
        },
        {
          update: {
            name: purchaseName,
            fields: toFsFields({
              campaignId: input.campaignId,
              customerId: input.customerId,
              qty: purchased + input.quantity,
              updatedAt: now,
            }),
          },
        },
      ];
      const committed = await commitWithTx(projectId, writes, tx);
      if (committed) {
        return {
          ok: true,
          reserved: input.quantity,
          stockRemaining: sale.stockTotal - (sale.stockReserved + input.quantity),
        };
      }
      // transaction conflict → retry with a fresh read
    } catch (err) {
      if (tx) await rollbackTransaction(projectId, tx).catch(() => {});
      throw err; // business/infra errors surface immediately
    }
  }
  throw new Error("flashsale/conflict: could not reserve stock after retries");
}

/** Release reserved stock (order cancelled / not paid) — also tx-safe. */
export async function releaseFlashSaleStock(
  projectId: string,
  campaignId: string,
  customerId: string,
  quantity: number,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const tx = await beginTransaction(projectId);
    const saleName = docPath(projectId, [FLASH_SALES_COLLECTION, campaignId]);
    const purchaseName = docPath(projectId, [
      FLASH_SALE_PURCHASES_COLLECTION,
      `${campaignId}_${customerId}`,
    ]);
    const docs = await batchGetDocsWithTx(projectId, [saleName, purchaseName], tx);
    const saleDoc = docs.get(saleName);
    const purchaseDoc = docs.get(purchaseName);
    if (!saleDoc?.exists || !purchaseDoc?.exists) {
      await rollbackTransaction(projectId, tx);
      return;
    }
    const sale = saleDoc.data as Record<string, unknown> as unknown as FlashSaleDoc;
    const purchased = Number(
      (purchaseDoc.data as Record<string, unknown> as Record<string, unknown>)["qty"],
    );
    const writes = [
      {
        update: {
          name: saleName,
          fields: toFsFields({
            ...sale,
            stockReserved: Math.max(0, sale.stockReserved - quantity),
          }),
        },
      },
      {
        update: {
          name: purchaseName,
          fields: toFsFields({
            campaignId,
            customerId,
            qty: Math.max(0, purchased - quantity),
            updatedAt: Date.now(),
          }),
        },
      },
    ];
    if (await commitWithTx(projectId, writes, tx)) return;
  }
  throw new Error("flashsale/conflict: could not release stock after retries");
}

/* ──────────────────────────────────────────────────────────────── */
/* Public (storefront) flash-sale view — sanitized (§12)            */
/* ──────────────────────────────────────────────────────────────── */

export interface PublicFlashSale {
  campaignId: string;
  productId: string | null;
  /**
   * Storefront convenience (attached by getPublicCampaignFlashSale):
   * the sale product's public listing info for the Buy Now link.
   * Absent when the sale has no productId or the product doc is gone.
   */
  product?: { slug: string | null; title: string | null; image: string | null } | null;
  salePriceMinor: number;
  originalPriceMinor: number;
  stockRemaining: number;
  perCustomerLimit: number;
  endsAt: number;
}

/**
 * The storefront's ONLY flash-sale read. Returns a live, in-window
 * flash sale for the given campaign with just the fields a customer
 * may see — internal stock bookkeeping, reservations and purchase
 * counters are stripped. null when: not found, inactive, outside the
 * sale window, or sold out (sold-out stays null so the UI can drop
 * the section instead of promising stock that isn't there).
 */
export async function getPublicActiveFlashSale(
  projectId: string,
  campaignId: string,
): Promise<PublicFlashSale | null> {
  const doc = await getFlashSale(projectId, campaignId);
  if (!doc || !doc.active) return null;
  const now = Date.now();
  if (now < doc.startAt || now > doc.endAt) return null;
  const stockRemaining = doc.stockTotal - doc.stockReserved;
  if (stockRemaining <= 0) return null;
  return {
    campaignId: doc.campaignId,
    productId: doc.productId,
    salePriceMinor: doc.salePriceMinor,
    originalPriceMinor: doc.originalPriceMinor,
    stockRemaining,
    perCustomerLimit: doc.perCustomerLimit,
    endsAt: doc.endAt,
  };
}

/* ──────────────────────────────────────────────────────────────── */
/* Reserve→order integration (Prompt 05 follow-up)                 */
/* ──────────────────────────────────────────────────────────────── */

/**
 * The CHECKOUT-side flash-sale lookup: the active, in-window flash
 * sale for a given product (there is at most one meaningful match —
 * if several are active we serve the one ending soonest so stock
 * drains deterministically). Server-only; internal bookkeeping
 * fields stay inside the server boundary.
 *
 * Returns null when: no sale bound to the product, none active,
 * none in-window, or all sold out. Checkout treats null as "normal
 * pricing applies".
 */
export async function getActiveFlashSaleForProduct(
  projectId: string,
  productId: string,
  now?: number,
): Promise<FlashSaleDoc | null> {
  const t = now ?? Date.now();
  const rows = await runFirestoreQuery(projectId, {
    from: [{ collectionId: FLASH_SALES_COLLECTION }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "productId" },
              op: "EQUAL",
              value: { stringValue: productId },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: "active" },
              op: "EQUAL",
              value: { booleanValue: true },
            },
          },
        ],
      },
    },
    limit: 10,
  });
  let best: FlashSaleDoc | null = null;
  for (const row of rows) {
    const doc = (row as { document?: { name?: string; fields?: Record<string, unknown> } })
      .document;
    if (!doc?.fields) continue;
    const sale = fromFsFields(
      doc.fields as Parameters<typeof fromFsFields>[0],
    ) as unknown as FlashSaleDoc;
    if (!sale.active || t < sale.startAt || t >= sale.endAt) continue;
    if (sale.stockTotal - sale.stockReserved <= 0) continue;
    if (!best || sale.endAt < best.endAt) best = sale;
  }
  return best;
}

/* ──────────────────────────────────────────────────────────────── */
/* Admin scheduling layer (Flash Sale Scheduling system)           */
/* ──────────────────────────────────────────────────────────────── */

/**
 * Deterministic effective lifecycle, ALWAYS derived from
 * isEnabled + window against the SERVER clock — never a persisted
 * cosmetic status field, never a device countdown:
 *
 *   DISABLED  !active
 *   ENDED     active && now >= endAt
 *   SCHEDULED active && now < startAt
 *   ACTIVE    active && startAt <= now < endAt
 *
 * (DRAFT is not an engine state: every created sale is immediately
 * publishable; the admin UI simply points at a future window.)
 */
export type FlashSaleStatus = "SCHEDULED" | "ACTIVE" | "ENDED" | "DISABLED";

export function computeFlashSaleStatus(
  sale: Pick<FlashSaleDoc, "active" | "startAt" | "endAt">,
  now: number = Date.now(),
): FlashSaleStatus {
  if (!sale.active) return "DISABLED";
  if (now >= sale.endAt) return "ENDED";
  if (now < sale.startAt) return "SCHEDULED";
  return "ACTIVE";
}

/** Admin operation options: the acting admin (for the audit trail). */
export interface AdminOpOpts {
  actor?: EventActor;
  /**
   * Escape hatch used ONLY by tests to prove the checkout-side
   * precedence over legacy overlapping data. Admin surfaces must
   * never pass this — overlapping windows are rejected at write.
   */
  allowOverlap?: boolean;
}

interface ConflictInput {
  productId: string;
  startAt: number;
  endAt: number;
  excludeCampaignId: string;
}

/** Any other ACTIVE sale for the same product overlapping [startAt,endAt). */
async function findFlashSaleConflict(
  projectId: string,
  input: ConflictInput,
): Promise<string | null> {
  const rows = await runFirestoreQuery(projectId, {
    from: [{ collectionId: FLASH_SALES_COLLECTION }],
    where: {
      fieldFilter: {
        field: { fieldPath: "productId" },
        op: "EQUAL",
        value: { stringValue: input.productId },
      },
    },
    limit: 25,
  });
  for (const row of rows) {
    const doc = (row as { document?: { name?: string; fields?: Record<string, unknown> } })
      .document;
    if (!doc?.fields) continue;
    const other = fromFsFields(
      doc.fields as Parameters<typeof fromFsFields>[0],
    ) as unknown as FlashSaleDoc;
    if (other.campaignId === input.excludeCampaignId) continue;
    if (!other.active) continue; // a disabled sale cannot serve — no ambiguity
    if (input.startAt < other.endAt && other.startAt < input.endAt) return other.campaignId;
  }
  return null;
}

export interface UpdateFlashSalePatch {
  startAt?: number;
  endAt?: number;
  stockLimit?: number;
  perCustomerLimit?: number;
  salePriceMinor?: number;
  originalPriceMinor?: number;
  /** May only change while NO stock is reserved (in-flight orders). */
  productId?: string | null;
}

/**
 * Edit/reschedule a flash sale. Validations run against the MERGED
 * doc (endAt > startAt, stockLimit >= stockReserved, price safety,
 * no past endAt while reservations are live, product switch only at
 * rest, Option-A conflict prevention when the window/product moves).
 * The write carries an explicit updateMask — only the changed
 * fields are touched, never a full-doc overwrite.
 */
export async function updateFlashSale(
  projectId: string,
  campaignId: string,
  patch: UpdateFlashSalePatch,
  opts: AdminOpOpts = {},
): Promise<FlashSaleDoc> {
  const current = await getFlashSale(projectId, campaignId);
  if (!current) throw new Error(`flashsale/notfound: ${campaignId}`);

  const next: FlashSaleDoc = { ...current };
  const fieldMask: string[] = [];
  if (patch.productId !== undefined) {
    const pid = patch.productId === null ? null : patch.productId.trim();
    if (pid === "") throw new Error("flashsale/validation: productId must be a non-empty string");
    if (pid !== current.productId && current.stockReserved > 0) {
      throw new Error(
        "flashsale/validation: cannot change the sale product while stock is reserved",
      );
    }
    next.productId = pid;
    fieldMask.push("productId");
  }
  if (patch.startAt !== undefined) {
    next.startAt = patch.startAt;
    fieldMask.push("startAt");
  }
  if (patch.endAt !== undefined) {
    next.endAt = patch.endAt;
    fieldMask.push("endAt");
  }
  if (patch.stockLimit !== undefined) {
    next.stockTotal = patch.stockLimit;
    fieldMask.push("stockTotal");
  }
  if (patch.perCustomerLimit !== undefined) {
    next.perCustomerLimit = patch.perCustomerLimit;
    fieldMask.push("perCustomerLimit");
  }
  if (patch.salePriceMinor !== undefined || patch.originalPriceMinor !== undefined) {
    const orig = patch.originalPriceMinor ?? next.originalPriceMinor;
    const sale = patch.salePriceMinor ?? next.salePriceMinor;
    const { result } = validateCampaignPricing(
      orig,
      { type: "PRICE_OVERRIDE", valueMinor: sale },
      null,
    );
    if (!result.ok) throw new Error(`flashsale/validation: ${result.errors.join("; ")}`);
    if (patch.originalPriceMinor !== undefined) {
      next.originalPriceMinor = orig;
      fieldMask.push("originalPriceMinor");
    }
    if (patch.salePriceMinor !== undefined) {
      next.salePriceMinor = sale;
      fieldMask.push("salePriceMinor");
    }
  }

  if (fieldMask.length === 0) return current; // nothing to do

  // Window + general validation on the merged doc.
  if (next.endAt <= next.startAt) {
    throw new Error("flashsale/validation: endAt must be after startAt");
  }
  if (next.stockTotal < 1) throw new Error("flashsale/validation: stockLimit must be >= 1");
  if (next.perCustomerLimit < 1)
    throw new Error("flashsale/validation: perCustomerLimit must be >= 1");
  if (next.stockTotal < next.stockReserved) {
    throw new Error(
      `flashsale/validation: stockLimit cannot drop below ${next.stockReserved} reserved units`,
    );
  }
  // A live sale with in-flight orders must never be retro-ended —
  // reserved stock can only drain through the order workflow.
  if (next.endAt <= Date.now() && next.stockReserved > 0) {
    throw new Error(
      "flashsale/validation: cannot schedule the end in the past while stock is reserved",
    );
  }

  // Conflict prevention when the window/product moved and the sale serves.
  const windowMoved =
    (patch.startAt !== undefined && patch.startAt !== current.startAt) ||
    (patch.endAt !== undefined && patch.endAt !== current.endAt);
  const productMoved = next.productId !== current.productId;
  if (next.productId && next.active && (windowMoved || productMoved) && !opts.allowOverlap) {
    const conflict = await findFlashSaleConflict(projectId, {
      productId: next.productId,
      startAt: next.startAt,
      endAt: next.endAt,
      excludeCampaignId: campaignId,
    });
    if (conflict) {
      throw new Error(
        `flashsale/conflict: product ${next.productId} already has an overlapping active flash sale (campaign ${conflict})`,
      );
    }
  }

  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [FLASH_SALES_COLLECTION, campaignId]),
        fields: toFsFields(
          Object.fromEntries(
            fieldMask.map((f) => [f, (next as unknown as Record<string, unknown>)[f]]),
          ),
        ),
        updateMask: { fieldPaths: fieldMask },
      },
    },
  ]);
  if (opts.actor) {
    const rescheduled = windowMoved;
    await appendAuditEntry(projectId, {
      actor: opts.actor,
      action: rescheduled ? "FLASH_SALE_RESCHEDULED" : "FLASH_SALE_UPDATED",
      target: `flashSales/${campaignId}`,
      meta: {
        before: { startAt: current.startAt, endAt: current.endAt, productId: current.productId },
        after: { startAt: next.startAt, endAt: next.endAt, productId: next.productId },
      },
    });
  }
  return next;
}

/**
 * Enable/disable a flash sale (admin manual control). Enabling runs
 * the same Option-A conflict check; a disabled sale releases nothing
 * by itself — in-flight reservations still drain via order events.
 */
export async function setFlashSaleEnabled(
  projectId: string,
  campaignId: string,
  enabled: boolean,
  opts: AdminOpOpts = {},
): Promise<FlashSaleDoc> {
  const current = await getFlashSale(projectId, campaignId);
  if (!current) throw new Error(`flashsale/notfound: ${campaignId}`);
  if (current.active === enabled) return current;
  if (enabled && current.productId) {
    const conflict = await findFlashSaleConflict(projectId, {
      productId: current.productId,
      startAt: current.startAt,
      endAt: current.endAt,
      excludeCampaignId: campaignId,
    });
    if (conflict) {
      throw new Error(
        `flashsale/conflict: product ${current.productId} already has an overlapping active flash sale (campaign ${conflict})`,
      );
    }
  }
  const next: FlashSaleDoc = { ...current, active: enabled };
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [FLASH_SALES_COLLECTION, campaignId]),
        fields: toFsFields({ active: enabled }),
        updateMask: { fieldPaths: ["active"] },
      },
    },
  ]);
  if (opts.actor) {
    await appendAuditEntry(projectId, {
      actor: opts.actor,
      action: enabled ? "FLASH_SALE_ENABLED" : "FLASH_SALE_DISABLED",
      target: `flashSales/${campaignId}`,
      meta: { productId: current.productId, startAt: current.startAt, endAt: current.endAt },
    });
  }
  return next;
}

/** Admin listing view: the doc + the DERIVED effective status. */
export interface AdminFlashSaleView extends FlashSaleDoc {
  status: FlashSaleStatus;
  stockRemaining: number;
}

/**
 * List all flash sales with their server-clock-derived effective
 * status for the admin dashboard. Read-only, no internal writes.
 */
export async function listFlashSales(
  projectId: string,
  now: number = Date.now(),
): Promise<AdminFlashSaleView[]> {
  const rows = await runFirestoreQuery(projectId, {
    from: [{ collectionId: FLASH_SALES_COLLECTION }],
    limit: 100,
  });
  const out: AdminFlashSaleView[] = [];
  for (const row of rows) {
    const doc = (row as { document?: { name?: string; fields?: Record<string, unknown> } })
      .document;
    if (!doc?.fields) continue;
    const sale = fromFsFields(
      doc.fields as Parameters<typeof fromFsFields>[0],
    ) as unknown as FlashSaleDoc;
    out.push({
      ...sale,
      status: computeFlashSaleStatus(sale, now),
      stockRemaining: sale.stockTotal - sale.stockReserved,
    });
  }
  out.sort((a, b) => b.startAt - a.startAt);
  return out;
}
