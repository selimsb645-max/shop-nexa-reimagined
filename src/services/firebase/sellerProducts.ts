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
import { getDb } from "./config";
import type { Product } from "@/types/commerce";

const PRODUCTS = "products";

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
  await updateDoc(doc(getDb(), PRODUCTS, id), {
    stock: Math.max(0, Math.floor(stock)),
    updatedAt: serverTimestamp(),
  });
}
