import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Category, Subcategory } from "@/types/commerce";

const COL = "categories";

export interface CategoryInput {
  name: string;
  slug: string;
  image: string | null;
  order: number;
  commissionRate?: number | null;
}

export interface SubcategoryInput {
  name: string;
  slug: string;
  order: number;
  commissionRate?: number | null;
}

export async function listCategoriesAdmin(): Promise<Category[]> {
  const snap = await getDocs(query(collection(getDb(), COL), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, "id">) }));
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const ref = await addDoc(collection(getDb(), COL), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCategory(id: string, patch: Partial<CategoryInput>): Promise<void> {
  await updateDoc(doc(getDb(), COL, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteCategory(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), COL, id));
}

export async function listSubcategoriesAdmin(categoryId: string): Promise<Subcategory[]> {
  const snap = await getDocs(
    query(collection(getDb(), COL, categoryId, "subcategories"), orderBy("order", "asc")),
  );
  return snap.docs.map((d) => ({
    id: d.id,
    categoryId,
    ...(d.data() as Omit<Subcategory, "id" | "categoryId">),
  }));
}

export async function createSubcategory(
  categoryId: string,
  input: SubcategoryInput,
): Promise<string> {
  const ref = doc(collection(getDb(), COL, categoryId, "subcategories"));
  await setDoc(ref, {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSubcategory(
  categoryId: string,
  subId: string,
  patch: Partial<SubcategoryInput>,
): Promise<void> {
  await updateDoc(doc(getDb(), COL, categoryId, "subcategories", subId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSubcategory(categoryId: string, subId: string): Promise<void> {
  await deleteDoc(doc(getDb(), COL, categoryId, "subcategories", subId));
}
