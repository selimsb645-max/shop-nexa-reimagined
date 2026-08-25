/**
 * AVENTA SHOP — Low Stock Alert Engine
 *
 * Creates notifications for sellers and admins when product stock
 * drops below the configured threshold (default: 5).
 *
 * Called from:
 * 1. checkout.server.ts — after stock decrement during order placement
 * 2. sellerProducts.ts — after manual stock update by seller
 * 3. adminProducts.ts  — after manual stock update by admin
 */

import {
  batchGetDocs,
  commitWrites,
  docPath,
  getAccessToken,
  getProjectId,
  newDocId,
  toFsFields,
  type FsWrite,
} from "./firebase-admin.server";

const LOW_STOCK_THRESHOLD = 5; // fallback when site settings unavailable

/**
 * Reads the stock alert threshold from site settings.
 * Falls back to 5 if settings are unavailable.
 */
export async function getStockAlertThreshold(): Promise<number> {
  try {
    const projectId = getProjectId();
    const token = await getAccessToken();
    const settingsDocPath = docPath(projectId, ["settings", "site"]);
    const docs = await batchGetDocs(projectId, [settingsDocPath]);
    const sDoc = docs.get(settingsDocPath);
    if (sDoc?.exists) {
      const inventory = (sDoc.data as Record<string, unknown>)["inventory"] as
        | { alertThreshold?: number }
        | undefined;
      if (inventory?.alertThreshold && inventory.alertThreshold > 0) {
        return inventory.alertThreshold;
      }
    }
  } catch {
    // Use fallback
  }
  return LOW_STOCK_THRESHOLD;
}

/**
 * Checks products for low stock and creates notifications for sellers + admin.
 *
 * @param products - Array of { productId, sellerId, title, currentStock } —
 *                   currentStock should be the stock AFTER any decrement/update.
 * @returns Number of notifications created.
 */
export async function checkLowStockAndNotify(
  products: Array<{
    productId: string;
    sellerId: string | null;
    title: string;
    currentStock: number;
  }>,
): Promise<number> {
  if (products.length === 0) return 0;

  const threshold = await getStockAlertThreshold();
  const projectId = getProjectId();
  const nowMs = Date.now();

  // Filter products that are at or below threshold and have stock > 0
  const lowStockProducts = products.filter(
    (p) => p.currentStock <= threshold && p.currentStock > 0,
  );

  if (lowStockProducts.length === 0) return 0;

  const writes: FsWrite[] = [];

  for (const p of lowStockProducts) {
    // Seller notification
    if (p.sellerId) {
      writes.push({
        update: {
          name: docPath(projectId, ["sellers", p.sellerId, "notifications", newDocId()]),
          fields: toFsFields({
            type: "stock_low",
            title: "Low stock alert",
            message: `${p.title} is running low — only ${p.currentStock} left in stock.`,
            link: `/seller/products`,
            read: false,
            productId: p.productId,
            currentStock: p.currentStock,
            createdAt: nowMs,
          }),
        },
        currentDocument: { exists: false },
      });
    }

    // Admin notification
    writes.push({
      update: {
        name: docPath(projectId, ["settings", "notifications", newDocId()]),
        fields: toFsFields({
          type: "stock_low",
          title: "Low stock alert",
          message: `${p.title}${p.sellerId ? ` (seller: ${p.sellerId.slice(0, 8)})` : ""} is running low — only ${p.currentStock} left in stock.`,
          link: `/admin/inventory`,
          read: false,
          productId: p.productId,
          sellerId: p.sellerId,
          currentStock: p.currentStock,
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });
  }

  if (writes.length > 0) {
    await commitWrites(projectId, writes);
  }

  return writes.length;
}

/**
 * Checks if a product's stock would be at or below threshold after a given change.
 * Returns the projected stock level.
 */
export function projectedStock(currentStock: number, change: number): number {
  return Math.max(0, currentStock + change);
}
