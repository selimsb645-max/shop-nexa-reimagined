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
} from "../firebase-admin.server";
import { validateCampaignPricing, type DiscountRules } from "./pricing";

export const FLASH_SALES_COLLECTION = "flashSales";
export const FLASH_SALE_PURCHASES_COLLECTION = "flashSalePurchases";

const MAX_ATTEMPTS = 5;

export interface FlashSaleDoc {
  campaignId: string;
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
): Promise<FlashSaleDoc> {
  if (input.stockLimit < 1) throw new Error("flashsale/validation: stockLimit must be >= 1");
  if (input.perCustomerLimit < 1) throw new Error("flashsale/validation: perCustomerLimit must be >= 1");
  if (input.endAt <= input.startAt) throw new Error("flashsale/validation: endAt must be after startAt");
  // Price safety (§6): sale price must be a valid discount of the original.
  const { result } = validateCampaignPricing(
    input.originalPriceMinor,
    { type: "PRICE_OVERRIDE", valueMinor: input.salePriceMinor },
    null,
  );
  if (!result.ok) throw new Error(`flashsale/validation: ${result.errors.join("; ")}`);

  const doc: FlashSaleDoc = {
    campaignId: input.campaignId,
    startAt: input.startAt,
    endAt: input.endAt,
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
  return doc;
}

export async function getFlashSale(projectId: string, campaignId: string): Promise<FlashSaleDoc | null> {
  const docs = await batchGetDocs(projectId, [
    docPath(projectId, [FLASH_SALES_COLLECTION, campaignId]),
  ]);
  const d = docs.get(docPath(projectId, [FLASH_SALES_COLLECTION, campaignId]));
  if (!d?.exists) return null;
  return (d.data as Record<string, unknown>) as unknown as FlashSaleDoc;
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
    const purchased = Number((purchaseDoc.data as Record<string, unknown> as Record<string, unknown>)["qty"]);
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
