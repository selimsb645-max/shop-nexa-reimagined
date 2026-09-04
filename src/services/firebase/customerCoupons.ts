import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { getDb } from "./config";
import type { Coupon } from "@/types/commerce";

/** Public, currently-usable coupons for the customer coupon wallet. */
export async function listAvailableCoupons(): Promise<Coupon[]> {
  const snap = await getDocs(
    query(collection(getDb(), "coupons"), where("active", "==", true), limit(50)),
  );
  const now = Date.now();
  return snap.docs
    .map((d) => ({ code: d.id, ...(d.data() as Omit<Coupon, "code">) }))
    .filter(
      (c) => (!c.expiresAt || c.expiresAt > now) && (c.usageLimit == null || c.uses < c.usageLimit),
    )
    .sort((a, b) => b.value - a.value);
}
