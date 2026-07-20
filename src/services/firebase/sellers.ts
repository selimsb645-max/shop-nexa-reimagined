import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./config";
import type { SellerNotification, SellerProfile, SellerStatus } from "@/types/seller";

const SELLERS = "sellers";

function nowMs() {
  return Date.now();
}

function mapSeller(id: string, d: Record<string, unknown>): SellerProfile {
  const r = d as Partial<SellerProfile> & Record<string, unknown>;
  return {
    uid: id,
    shopName: String(r.shopName ?? ""),
    shopSlug: String(r.shopSlug ?? id),
    description: String(r.description ?? ""),
    logoUrl: (r.logoUrl as string | null) ?? null,
    phone: String(r.phone ?? ""),
    email: String(r.email ?? ""),
    addressLine: String(r.addressLine ?? ""),
    city: String(r.city ?? ""),
    country: String(r.country ?? ""),
    status: (r.status as SellerStatus) ?? "pending",
    rejectionReason: (r.rejectionReason as string | null) ?? null,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : nowMs(),
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : nowMs(),
  };
}

export async function getSellerProfile(uid: string): Promise<SellerProfile | null> {
  const snap = await getDoc(doc(getDb(), SELLERS, uid));
  return snap.exists() ? mapSeller(snap.id, snap.data()) : null;
}

export interface SellerApplicationInput {
  uid: string;
  email: string | null;
  shopName: string;
  description: string;
  phone: string;
  addressLine: string;
  city: string;
  country: string;
  logoUrl?: string | null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function applyForSeller(input: SellerApplicationInput): Promise<void> {
  const ref = doc(getDb(), SELLERS, input.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const status = existing.data().status as SellerStatus;
    if (status === "approved" || status === "pending") {
      throw new Error(
        status === "approved" ? "You are already an approved seller." : "Your application is already under review.",
      );
    }
  }
  const shopSlug = slugify(input.shopName) || input.uid;
  await setDoc(ref, {
    uid: input.uid,
    email: input.email ?? "",
    shopName: input.shopName,
    shopSlug,
    description: input.description,
    phone: input.phone,
    addressLine: input.addressLine,
    city: input.city,
    country: input.country,
    logoUrl: input.logoUrl ?? null,
    status: "pending" as SellerStatus,
    rejectionReason: null,
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateSellerProfile(
  uid: string,
  patch: Partial<Pick<SellerProfile, "shopName" | "description" | "logoUrl" | "phone" | "addressLine" | "city" | "country">>,
): Promise<void> {
  await updateDoc(doc(getDb(), SELLERS, uid), { ...patch, updatedAt: serverTimestamp() });
}

// Notifications

function mapNotification(id: string, d: Record<string, unknown>): SellerNotification {
  const r = d as Partial<SellerNotification> & Record<string, unknown>;
  return {
    id,
    type: (r.type as SellerNotification["type"]) ?? "system",
    title: String(r.title ?? ""),
    message: String(r.message ?? ""),
    link: (r.link as string | null) ?? null,
    read: Boolean(r.read),
    createdAt: typeof r.createdAt === "number" ? r.createdAt : nowMs(),
  };
}

export async function listNotifications(uid: string, max = 50): Promise<SellerNotification[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), SELLERS, uid, "notifications"),
      orderBy("createdAt", "desc"),
      fbLimit(max),
    ),
  );
  return snap.docs.map((d) => mapNotification(d.id, d.data()));
}

export async function countUnreadNotifications(uid: string): Promise<number> {
  const snap = await getDocs(
    query(collection(getDb(), SELLERS, uid, "notifications"), where("read", "==", false)),
  );
  return snap.size;
}

export async function createNotification(
  sellerId: string,
  n: Omit<SellerNotification, "id" | "read" | "createdAt">,
): Promise<void> {
  await addDoc(collection(getDb(), SELLERS, sellerId, "notifications"), {
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationRead(sellerId: string, id: string): Promise<void> {
  await updateDoc(doc(getDb(), SELLERS, sellerId, "notifications", id), { read: true });
}

export async function markAllNotificationsRead(sellerId: string): Promise<void> {
  const snap = await getDocs(
    query(collection(getDb(), SELLERS, sellerId, "notifications"), where("read", "==", false)),
  );
  if (snap.empty) return;
  const batch = writeBatch(getDb());
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}
