import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDb, getFirebaseAuth } from "./config";
import { getSiteSetting } from "./adminSettings";
import { restockProduct } from "@/lib/seller-inventory.functions";
import type { Product } from "@/types/commerce";

const PRODUCTS = "products";
const LOW_STOCK_FALLBACK = 5;

/**
 * Checks if stock is at/below threshold and creates a seller notification + admin notification.
 * Client-side: writes to seller's own notifications (allowed by rules) and settings notifications.
 */
async function notifyLowStock(
  sellerId: string,
  productId: string,
  title: string,
  newStock: number,
): Promise<void> {
  if (newStock <= 0) return; // out-of-stock is handled separately
  const threshold = await getSiteSetting("inventory.alertThreshold", LOW_STOCK_FALLBACK);
  if (newStock > threshold) return;

  const now = Date.now();
  const db = getDb();

  // Seller notification
  await addDoc(collection(db, "sellers", sellerId, "notifications"), {
    type: "stock_low",
    title: "Low stock alert",
    message: `${title} is running low — only ${newStock} left in stock.`,
    link: "/seller/products",
    read: false,
    createdAt: now,
  });

  // Admin notification
  try {
    await addDoc(collection(db, "settings", "site", "notifications"), {
      type: "stock_low",
      title: "Low stock alert",
      message: `${title} (seller: ${sellerId.slice(0, 8)}) is running low — only ${newStock} left in stock.`,
      link: "/admin/inventory",
      read: false,
      productId,
      sellerId,
      currentStock: newStock,
      createdAt: now,
    });
  } catch {
    // Admin notification write may fail if rules don't permit — non-critical
  }
}

function nowMs() {
  return Date.now();
}

export interface SellerProductInput {
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  brand: string | null;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  tax: number;
  images: string[];
  categoryId: string;
  categorySlug: string;
  subcategoryId?: string | null;
  subcategorySlug?: string | null;
  stock: number;
  sku: string | null;
  tags: string[];
  colors: string[];
  sizes: string[];
  featured: boolean;
  freeDelivery: boolean;
  status: "draft" | "published" | "archived";
}

function toProduct(id: string, data: Record<string, unknown>): Product {
  const d = data as Record<string, unknown>;
  return {
    id,
    title: String(d.title ?? ""),
    slug: String(d.slug ?? id),
    shortDescription: String(d.shortDescription ?? ""),
    description: String(d.description ?? ""),
    brand: d.brand ? String(d.brand) : null,
    price: Number(d.price ?? 0),
    compareAtPrice: d.compareAtPrice != null ? Number(d.compareAtPrice) : null,
    costPrice: d.costPrice != null ? Number(d.costPrice) : null,
    tax: Number(d.tax ?? 0),
    images: Array.isArray(d.images) ? (d.images as string[]) : [],
    categoryId: String(d.categoryId ?? ""),
    categorySlug: String(d.categorySlug ?? ""),
    subcategoryId: d.subcategoryId ? String(d.subcategoryId) : null,
    subcategorySlug: d.subcategorySlug ? String(d.subcategorySlug) : null,
    stock: Number(d.stock ?? 0),
    rating: Number(d.rating ?? 0),
    reviewCount: Number(d.reviewCount ?? 0),
    tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
    featured: Boolean(d.featured),
    freeDelivery: Boolean(d.freeDelivery ?? false),
    sellerId: d.sellerId ? String(d.sellerId) : null,
    sku: d.sku ? String(d.sku) : null,
    status: (d.status as "draft" | "published" | "archived") ?? "published",
    colors: Array.isArray(d.colors) ? (d.colors as string[]) : [],
    sizes: Array.isArray(d.sizes) ? (d.sizes as string[]) : [],
    createdAt: typeof d.createdAt === "number" ? d.createdAt : nowMs(),
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : nowMs(),
  };
}

export async function listSellerProducts(sellerId: string): Promise<Product[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), PRODUCTS),
      where("sellerId", "==", sellerId),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => toProduct(d.id, d.data()));
}

export async function getSellerProduct(sellerId: string, id: string): Promise<Product | null> {
  const snap = await getDoc(doc(getDb(), PRODUCTS, id));
  if (!snap.exists()) return null;
  const p = toProduct(snap.id, snap.data());
  if (p.sellerId !== sellerId) return null;
  return p;
}

export async function slugExists(slug: string, ignoreId?: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(getDb(), PRODUCTS), where("slug", "==", slug), fbLimit(1)),
  );
  return snap.docs.some((d) => d.id !== ignoreId);
}

export async function createSellerProduct(
  sellerId: string,
  input: SellerProductInput,
): Promise<string> {
  if (await slugExists(input.slug)) {
    throw new Error("A product with this slug already exists. Choose a different one.");
  }
  const ref = await addDoc(collection(getDb(), PRODUCTS), {
    ...input,
    sellerId,
    rating: 0,
    reviewCount: 0,
    approved: false,
    // New products always enter as drafts — publication happens only
    // through the QC pipeline (qc.server LISTED transition).
    status: "draft",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSellerProduct(
  sellerId: string,
  id: string,
  input: SellerProductInput,
): Promise<void> {
  const existing = await getSellerProduct(sellerId, id);
  if (!existing) throw new Error("Product not found or you don't have permission to edit it.");
  if (input.slug !== existing.slug && (await slugExists(input.slug, id))) {
    throw new Error("A product with this slug already exists. Choose a different one.");
  }
  await updateDoc(doc(getDb(), PRODUCTS, id), {
    ...input,
    sellerId,
    updatedAt: serverTimestamp(),
  });
  // Low stock check — only if stock changed to a lower value
  if (input.stock < existing.stock) {
    await notifyLowStock(sellerId, id, input.title, Math.max(0, Math.floor(input.stock)));
  }
}

export async function deleteSellerProduct(sellerId: string, id: string): Promise<void> {
  const existing = await getSellerProduct(sellerId, id);
  if (!existing) throw new Error("Product not found or you don't have permission to delete it.");
  await deleteDoc(doc(getDb(), PRODUCTS, id));
}

export async function setProductStatus(
  sellerId: string,
  id: string,
  status: "draft" | "published" | "archived",
): Promise<void> {
  const existing = await getSellerProduct(sellerId, id);
  if (!existing) throw new Error("Product not found.");
  await updateDoc(doc(getDb(), PRODUCTS, id), { status, updatedAt: serverTimestamp() });
}

export async function setProductStock(sellerId: string, id: string, stock: number): Promise<void> {
  const existing = await getSellerProduct(sellerId, id);
  if (!existing) throw new Error("Product not found.");
  const newStock = Math.max(0, Math.floor(stock));

  // Inventory counters (stock/availableStock/reservedStock/soldStock)
  // are SERVER-CONTROLLED — Firestore rules reject ANY client SDK
  // write to `products.stock`, even from the owning seller (see
  // firestore.rules `match /products/{id}`, and inventory.server.ts).
  // This goes through an Admin-SDK-backed server function instead,
  // which re-verifies ownership and approval status, and keeps
  // availableStock consistent in the same transaction.
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();

  const result = await restockProduct({
    data: { idToken, productId: id, newStock },
  });

  // Low stock check — only if stock went down
  if (result.newStock < result.previousStock) {
    await notifyLowStock(sellerId, id, result.title || existing.title, result.newStock);
  }
}

// ───────────────────────────────────────────────────────────────
// Product QC — seller-side reads (client SDK, rules-gated)
// ───────────────────────────────────────────────────────────────
// Reviews are written ONLY by server functions (qc.server.ts);
// the rules allow a seller to read their own review docs. One
// query returns the seller's whole QC pipeline state — no N+1.

export type SellerQcStatus =
  "DRAFT" | "PENDING_QC" | "IN_QC" | "QC_PASSED" | "QC_FAILED" | "LISTED" | "UNLISTED";

export interface SellerQcChecklistResult {
  key: string;
  passed: boolean;
  note?: string | null;
}

export interface SellerQcReview {
  reviewId: string;
  productId: string;
  sellerUid: string;
  status: SellerQcStatus;
  checklist: SellerQcChecklistResult[];
  reviewerUid: string | null;
  failReasons: string[];
  decision: "changes_required" | "rejected" | null;
  reviewerNote: string | null;
  submittedAt: number;
  reviewedAt: number | null;
  listedAt: number | null;
}

/** All QC reviews owned by this seller, newest submissions first. */
export async function listMyQcReviews(sellerUid: string): Promise<SellerQcReview[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), "qcReviews"),
      where("sellerUid", "==", sellerUid),
      orderBy("submittedAt", "desc"),
    ),
  );
  return snap.docs.map((d) => {
    const v = d.data() as Record<string, unknown>;
    return {
      reviewId: String(v.reviewId ?? d.id),
      productId: String(v.productId ?? ""),
      sellerUid: String(v.sellerUid ?? ""),
      status: (v.status as SellerQcStatus) ?? "DRAFT",
      checklist: (v.checklist as SellerQcChecklistResult[]) ?? [],
      reviewerUid: (v.reviewerUid as string | null) ?? null,
      failReasons: (v.failReasons as string[]) ?? [],
      decision: (v.decision as "changes_required" | "rejected" | null) ?? null,
      reviewerNote: (v.reviewerNote as string | null) ?? null,
      submittedAt: Number(v.submittedAt ?? 0),
      reviewedAt: (v.reviewedAt as number | null) ?? null,
      listedAt: (v.listedAt as number | null) ?? null,
    };
  });
}
