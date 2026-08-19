import { getDoc, doc } from "firebase/firestore";
import { getDb } from "./config";
import type { Product } from "@/types/commerce";

export interface ComparedProduct extends Product {
  specs: Record<string, string>;
}

export async function getProductForComparison(productId: string): Promise<ComparedProduct | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "products", productId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    title: String(data.title ?? ""),
    slug: String(data.slug ?? snap.id),
    shortDescription: String(data.shortDescription ?? ""),
    description: String(data.description ?? ""),
    brand: (data.brand as string | null) ?? null,
    price: Number(data.price ?? 0),
    costPrice: data.costPrice != null ? Number(data.costPrice) : null,
    tax: Number(data.tax ?? 0),
    compareAtPrice: data.compareAtPrice != null ? Number(data.compareAtPrice) : null,
    images: Array.isArray(data.images) ? (data.images as string[]) : [],
    categoryId: String(data.categoryId ?? ""),
    categorySlug: String(data.categorySlug ?? ""),
    subcategoryId: data.subcategoryId ? String(data.subcategoryId) : null,
    subcategorySlug: data.subcategorySlug ? String(data.subcategorySlug) : null,
    stock: Number(data.stock ?? 0),
    rating: Number(data.rating ?? 0),
    reviewCount: Number(data.reviewCount ?? 0),
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    featured: Boolean(data.featured),
    sellerId: data.sellerId ? String(data.sellerId) : null,
    sku: data.sku ? String(data.sku) : null,
    status: (data.status as "draft" | "published" | "archived") ?? "published",
    colors: Array.isArray(data.colors) ? (data.colors as string[]) : [],
    sizes: Array.isArray(data.sizes) ? (data.sizes as string[]) : [],
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
    specs: (data.specs as Record<string, string>) ?? {},
  };
}
