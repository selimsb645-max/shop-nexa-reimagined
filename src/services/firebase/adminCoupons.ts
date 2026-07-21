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
} from "firebase/firestore";
import { getDb } from "./config";
import type { Coupon, CouponType } from "@/types/commerce";

const COL = "coupons";

function mapCoupon(id: string, d: Record<string, unknown>): Coupon {
  return {
    code: id,
    type: (d.type as CouponType) ?? "percent",
    value: Number(d.value ?? 0),
    minSubtotal: Number(d.minSubtotal ?? 0),
    expiresAt: d.expiresAt != null ? Number(d.expiresAt) : null,
    active: Boolean(d.active),
    usageLimit: d.usageLimit != null ? Number(d.usageLimit) : null,
    uses: Number(d.uses ?? 0),
  };
}

export async function listCoupons(): Promise<Coupon[]> {
  const snap = await getDocs(query(collection(getDb(), COL), orderBy("code", "asc")));
  return snap.docs.map((d) => mapCoupon(d.id, d.data()));
}

export interface CouponInput {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  expiresAt: number | null;
  active: boolean;
  usageLimit: number | null;
}

export async function upsertCoupon(input: CouponInput): Promise<void> {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Coupon code required");
  const ref = doc(getDb(), COL, code);
  const existing = await getDoc(ref);
  await setDoc(ref, {
    type: input.type,
    value: input.value,
    minSubtotal: input.minSubtotal,
    expiresAt: input.expiresAt,
    active: input.active,
    usageLimit: input.usageLimit,
    uses: existing.exists() ? Number(existing.data().uses ?? 0) : 0,
    updatedAt: serverTimestamp(),
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
  });
}

export async function updateCouponActive(code: string, active: boolean): Promise<void> {
  await updateDoc(doc(getDb(), COL, code.toUpperCase()), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCoupon(code: string): Promise<void> {
  await deleteDoc(doc(getDb(), COL, code.toUpperCase()));
}
