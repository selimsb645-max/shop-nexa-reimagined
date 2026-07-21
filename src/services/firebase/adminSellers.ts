import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import type { SellerProfile, SellerStatus } from "@/types/seller";

const SELLERS = "sellers";

function mapSeller(id: string, d: Record<string, unknown>): SellerProfile {
  const created = d.createdAt as { toMillis?: () => number } | number | undefined;
  return {
    uid: id,
    shopName: String(d.shopName ?? ""),
    shopSlug: String(d.shopSlug ?? id),
    description: String(d.description ?? ""),
    logoUrl: (d.logoUrl as string | null) ?? null,
    phone: String(d.phone ?? ""),
    email: String(d.email ?? ""),
    addressLine: String(d.addressLine ?? ""),
    city: String(d.city ?? ""),
    country: String(d.country ?? ""),
    status: (d.status as SellerStatus) ?? "pending",
    rejectionReason: (d.rejectionReason as string | null) ?? null,
    createdAt:
      typeof created === "number" ? created : created?.toMillis?.() ?? Date.now(),
    updatedAt: Date.now(),
  };
}

export async function listAllSellers(): Promise<SellerProfile[]> {
  const snap = await getDocs(
    query(collection(getDb(), SELLERS), orderBy("createdAt", "desc")),
  );
  return snap.docs.map((s) => mapSeller(s.id, s.data()));
}

export async function setSellerStatus(
  uid: string,
  status: SellerStatus,
  rejectionReason?: string | null,
): Promise<void> {
  await updateDoc(doc(getDb(), SELLERS, uid), {
    status,
    rejectionReason: rejectionReason ?? null,
    updatedAt: serverTimestamp(),
  });
  // Notify seller
  await addDoc(collection(getDb(), SELLERS, uid, "notifications"), {
    type: "approval",
    title:
      status === "approved"
        ? "Application approved"
        : status === "rejected"
          ? "Application rejected"
          : status === "suspended"
            ? "Account suspended"
            : "Application under review",
    message:
      status === "approved"
        ? "Your seller account is now active. You can start listing products."
        : status === "rejected"
          ? `Your application was rejected.${rejectionReason ? " Reason: " + rejectionReason : ""}`
          : status === "suspended"
            ? "Your seller account has been suspended. Contact support for details."
            : "Your application status has been updated.",
    link: "/seller",
    read: false,
    createdAt: serverTimestamp(),
  });
}
