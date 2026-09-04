import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Product } from "@/types/commerce";

const PRODUCTS = "products";

function toProduct(id: string, d: Record<string, unknown>): Product & { approved: boolean } {
  return {
    id,
    title: String(d.title ?? ""),
    slug: String(d.slug ?? id),
    shortDescription: String(d.shortDescription ?? ""),
    description: String(d.description ?? ""),
    brand: (d.brand as string | null) ?? null,
    price: Number(d.price ?? 0),
    costPrice: d.costPrice != null ? Number(d.costPrice) : null,
    tax: Number(d.tax ?? 0),
    compareAtPrice: d.compareAtPrice != null ? Number(d.compareAtPrice) : null,
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
    sellerId: d.sellerId ? String(d.sellerId) : null,
    sku: d.sku ? String(d.sku) : null,
    status: (d.status as "draft" | "published" | "archived") ?? "published",
    colors: Array.isArray(d.colors) ? (d.colors as string[]) : [],
    sizes: Array.isArray(d.sizes) ? (d.sizes as string[]) : [],
    createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
    approved: d.approved !== false, // default true (existing seed products)
  };
}

export async function listAllProductsAdmin(): Promise<(Product & { approved: boolean })[]> {
  const snap = await getDocs(query(collection(getDb(), PRODUCTS), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => toProduct(d.id, d.data()));
}

export async function getProductAdmin(
  id: string,
): Promise<(Product & { approved: boolean }) | null> {
  const snap = await getDoc(doc(getDb(), PRODUCTS, id));
  return snap.exists() ? toProduct(snap.id, snap.data()) : null;
}

export async function approveProduct(id: string, approved: boolean): Promise<void> {
  await updateDoc(doc(getDb(), PRODUCTS, id), { approved, updatedAt: serverTimestamp() });
}

export async function deleteProductAdmin(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), PRODUCTS, id));
}

export async function updateProductAdmin(id: string, patch: Partial<Product>): Promise<void> {
  await updateDoc(doc(getDb(), PRODUCTS, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export interface AdminProductInput {
  title: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  images: string[];
  categoryId: string;
  categorySlug: string;
  subcategoryId: string | null;
  subcategorySlug: string | null;
  stock: number;
  sku: string | null;
  tags: string[];
  colors: string[];
  sizes: string[];
  featured: boolean;
  status: "draft" | "published" | "archived";
}

export async function slugTaken(slug: string, ignoreId?: string): Promise<boolean> {
  const snap = await getDocs(query(collection(getDb(), PRODUCTS), where("slug", "==", slug)));
  return snap.docs.some((d) => d.id !== ignoreId);
}

export async function createProductAdmin(input: AdminProductInput): Promise<string> {
  if (await slugTaken(input.slug)) throw new Error("Slug already exists");
  const ref = await addDoc(collection(getDb(), PRODUCTS), {
    ...input,
    sellerId: null,
    rating: 0,
    reviewCount: 0,
    approved: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// Bulk operations

export interface BulkPriceUpdate {
  ids: string[];
  mode: "set" | "increase_percent" | "decrease_percent" | "increase_amount" | "decrease_amount";
  value: number;
}

export async function bulkPriceUpdate(op: BulkPriceUpdate): Promise<number> {
  if (!op.ids.length) return 0;
  const db = getDb();
  const batch = writeBatch(db);
  let count = 0;
  for (const id of op.ids) {
    const snap = await getDoc(doc(db, PRODUCTS, id));
    if (!snap.exists()) continue;
    const current = Number(snap.data().price ?? 0);
    let next = current;
    switch (op.mode) {
      case "set":
        next = op.value;
        break;
      case "increase_percent":
        next = current * (1 + op.value / 100);
        break;
      case "decrease_percent":
        next = current * (1 - op.value / 100);
        break;
      case "increase_amount":
        next = current + op.value;
        break;
      case "decrease_amount":
        next = current - op.value;
        break;
    }
    next = Math.max(0, Math.round(next * 100) / 100);
    batch.update(doc(db, PRODUCTS, id), { price: next, updatedAt: serverTimestamp() });
    count += 1;
  }
  await batch.commit();
  return count;
}

export async function bulkSetStatus(
  ids: string[],
  status: "draft" | "published" | "archived",
): Promise<number> {
  if (!ids.length) return 0;
  const db = getDb();
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(doc(db, PRODUCTS, id), { status, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return ids.length;
}

export async function bulkSetApproval(ids: string[], approved: boolean): Promise<number> {
  if (!ids.length) return 0;
  const db = getDb();
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(doc(db, PRODUCTS, id), { approved, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return ids.length;
}

export async function bulkSetStock(ids: string[], stock: number): Promise<number> {
  if (!ids.length) return 0;
  const db = getDb();
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(doc(db, PRODUCTS, id), {
      stock: Math.max(0, Math.floor(stock)),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return ids.length;
}

export async function bulkDelete(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const db = getDb();
  const batch = writeBatch(db);
  for (const id of ids) batch.delete(doc(db, PRODUCTS, id));
  await batch.commit();
  return ids.length;
}
