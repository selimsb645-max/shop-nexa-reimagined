import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { getDb } from "./config";
import type { Category, Subcategory } from "@/types/commerce";

export async function listCategories(): Promise<Category[]> {
  const snap = await getDocs(query(collection(getDb(), "categories"), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, "id">) }));
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const snap = await getDocs(query(collection(getDb(), "categories"), where("slug", "==", slug)));
  const doc = snap.docs[0];
  return doc ? { id: doc.id, ...(doc.data() as Omit<Category, "id">) } : null;
}

export async function listSubcategories(categoryId: string): Promise<Subcategory[]> {
  const snap = await getDocs(
    query(collection(getDb(), "categories", categoryId, "subcategories"), orderBy("order", "asc")),
  );
  return snap.docs.map((d) => ({
    id: d.id,
    categoryId,
    ...(d.data() as Omit<Subcategory, "id" | "categoryId">),
  }));
}
