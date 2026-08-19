import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Product } from "@/types/commerce";

function toProduct(id: string, data: Record<string, unknown>): Product & { approved: boolean } {
  return {
    id,
    title: String(data.title ?? ""),
    slug: String(data.slug ?? id),
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
    approved: data.approved !== false,
  };
}

export interface ListProductsOpts {
  categorySlug?: string;
  subcategorySlug?: string;
  featured?: boolean;
  limit?: number;
  sort?: "newest" | "price-asc" | "price-desc" | "rating";
}

function isPublic(p: Product & { approved?: boolean }): boolean {
  return (p.status ?? "published") === "published" && p.approved !== false;
}

export async function listAllProducts(): Promise<Product[]> {
  const snap = await getDocs(collection(getDb(), "products"));
  return snap.docs.map((d) => toProduct(d.id, d.data())).filter(isPublic);
}

export async function listProducts(opts: ListProductsOpts = {}): Promise<Product[]> {
  const clauses = [];
  if (opts.categorySlug) clauses.push(where("categorySlug", "==", opts.categorySlug));
  if (opts.subcategorySlug) clauses.push(where("subcategorySlug", "==", opts.subcategorySlug));
  if (opts.featured != null) clauses.push(where("featured", "==", opts.featured));
  const orderField =
    opts.sort === "price-asc" || opts.sort === "price-desc"
      ? "price"
      : opts.sort === "rating"
        ? "rating"
        : "createdAt";
  const direction = opts.sort === "price-asc" ? "asc" : "desc";
  const q = query(
    collection(getDb(), "products"),
    ...clauses,
    orderBy(orderField, direction),
    fbLimit(opts.limit ?? 60),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toProduct(d.id, d.data())).filter(isPublic);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const snap = await getDocs(
    query(collection(getDb(), "products"), where("slug", "==", slug), fbLimit(1)),
  );
  const d = snap.docs[0];
  return d ? toProduct(d.id, d.data()) : null;
}

export async function getProductById(id: string): Promise<Product | null> {
  const d = await getDoc(doc(getDb(), "products", id));
  return d.exists() ? toProduct(d.id, d.data()) : null;
}

export function filterAndSort(
  products: Product[],
  opts: {
    q?: string;
    categorySlug?: string;
    subcategorySlug?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    sort?: ListProductsOpts["sort"];
  },
): Product[] {
  const q = opts.q?.trim().toLowerCase();
  let out = products.filter((p) => {
    if (opts.categorySlug && p.categorySlug !== opts.categorySlug) return false;
    if (opts.subcategorySlug && p.subcategorySlug !== opts.subcategorySlug) return false;
    if (opts.minPrice != null && p.price < opts.minPrice) return false;
    if (opts.maxPrice != null && p.price > opts.maxPrice) return false;
    if (opts.minRating != null && p.rating < opts.minRating) return false;
    if (q) {
      const hay = `${p.title} ${p.description} ${p.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  switch (opts.sort) {
    case "price-asc":
      out = out.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      out = out.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      out = out.sort((a, b) => b.rating - a.rating);
      break;
    default:
      out = out.sort((a, b) => b.createdAt - a.createdAt);
  }
  return out;
}
