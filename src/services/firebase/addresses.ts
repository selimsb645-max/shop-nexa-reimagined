import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./config";
import { toMs } from "./timestamps";
import type { Address } from "@/types/customer";

function path(uid: string) {
  return collection(getDb(), "users", uid, "addresses");
}

function mapAddress(id: string, data: Record<string, unknown>): Address {
  return {
    id,
    label: String(data.label ?? "Home"),
    fullName: String(data.fullName ?? ""),
    phone: String(data.phone ?? ""),
    addressLine: String(data.addressLine ?? ""),
    city: String(data.city ?? ""),
    postalCode: String(data.postalCode ?? ""),
    country: String(data.country ?? ""),
    notes: data.notes ? String(data.notes) : undefined,
    isDefault: Boolean(data.isDefault),
    createdAt: toMs(data.createdAt),
    updatedAt: toMs(data.updatedAt),
  };
}

export async function listAddresses(uid: string): Promise<Address[]> {
  const snap = await getDocs(query(path(uid), orderBy("createdAt", "desc")));
  const items = snap.docs.map((d) => mapAddress(d.id, d.data() as Record<string, unknown>));
  return items.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export async function getDefaultAddress(uid: string): Promise<Address | null> {
  const all = await listAddresses(uid);
  return all.find((a) => a.isDefault) ?? all[0] ?? null;
}

export type AddressInput = Omit<Address, "id" | "createdAt" | "updatedAt">;

export async function saveAddress(uid: string, input: AddressInput, id?: string): Promise<string> {
  const db = getDb();
  const ref = id ? doc(db, "users", uid, "addresses", id) : doc(path(uid));
  const exists = id ? (await getDoc(ref)).exists() : false;
  await setDoc(
    ref,
    {
      ...input,
      notes: input.notes ?? "",
      createdAt: exists ? undefined : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  if (input.isDefault) await setDefaultAddress(uid, ref.id);
  return ref.id;
}

export async function setDefaultAddress(uid: string, id: string): Promise<void> {
  const snap = await getDocs(path(uid));
  const batch = writeBatch(getDb());
  snap.docs.forEach((d) => {
    batch.update(d.ref, { isDefault: d.id === id, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function deleteAddress(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), "users", uid, "addresses", id));
}

export async function touchAddress(uid: string, id: string): Promise<void> {
  await updateDoc(doc(getDb(), "users", uid, "addresses", id), {
    updatedAt: serverTimestamp(),
  });
}
