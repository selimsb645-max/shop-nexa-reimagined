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
import type {
  SellerNotification,
  SellerNotificationType,
  SellerProfile,
  SellerStatus,
  RegistrationStep,
  SellerBankInfo,
  SellerIdentityInfo,
  SellerBusinessInfo,
  SellerStoreSettings,
} from "@/types/seller";

const SELLERS = "sellers";

function nowMs() {
  return Date.now();
}

function mapSeller(id: string, d: Record<string, unknown>): SellerProfile {
  const r = d as Record<string, unknown>;
  const ts = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "toMillis" in v) {
      return (v as { toMillis: () => number }).toMillis();
    }
    return nowMs();
  };

  return {
    uid: id,
    shopName: String(r.shopName ?? ""),
    shopSlug: String(r.shopSlug ?? id),
    description: String(r.description ?? ""),
    logoUrl: (r.logoUrl as string | null) ?? null,
    bannerUrl: (r.bannerUrl as string | null) ?? null,
    phone: String(r.phone ?? ""),
    email: String(r.email ?? ""),
    addressLine: String(r.addressLine ?? ""),
    city: String(r.city ?? ""),
    area: (r.area as string | null) ?? null,
    country: String(r.country ?? "Bangladesh"),
    postalCode: (r.postalCode as string | null) ?? null,
    status: (r.status as SellerStatus) ?? "draft",
    rejectionReason: (r.rejectionReason as string | null) ?? null,
    currentStep: (r.currentStep as RegistrationStep) ?? "store_info",
    termsAccepted: Boolean(r.termsAccepted ?? false),
    termsAcceptedAt: r.termsAcceptedAt != null ? ts(r.termsAcceptedAt) : null,
    submittedAt: r.submittedAt != null ? ts(r.submittedAt) : null,
    approvedAt: r.approvedAt != null ? ts(r.approvedAt) : null,
    commissionRate: Number(r.commissionRate ?? 0.08),
    totalEarnings: Number(r.totalEarnings ?? 0),
    availableBalance: Number(r.availableBalance ?? 0),
    pendingBalance: Number(r.pendingBalance ?? 0),
    withdrawnTotal: Number(r.withdrawnTotal ?? 0),
    bankInfo: (r.bankInfo as SellerBankInfo) ?? {
      bankName: null, accountName: null, accountNumber: null,
      branchName: null, routingNumber: null,
      mobileBankingType: null, mobileBankingNumber: null,
    },
    identity: (r.identity as SellerIdentityInfo) ?? {
      fullName: null, nidNumber: null, nidFrontUrl: null,
      nidBackUrl: null, tradeLicenseUrl: null, tradeLicenseNumber: null,
      verified: false,
    },
    business: (r.business as SellerBusinessInfo) ?? {
      businessType: null, businessName: null, taxId: null,
      website: null, socialMediaLinks: [],
    },
    storeSettings: (r.storeSettings as SellerStoreSettings) ?? {
      autoAcceptOrders: false, announcement: null,
      responseTimeHours: 24, returnPolicyDays: 7, operatingHours: null,
    },
    verified: Boolean(r.verified ?? false),
    totalProducts: Number(r.totalProducts ?? 0),
    totalOrders: Number(r.totalOrders ?? 0),
    rating: Number(r.rating ?? 0),
    ratingCount: Number(r.ratingCount ?? 0),
    followers: Number(r.followers ?? 0),
    warehouses: Array.isArray(r.warehouses) ? (r.warehouses as any[]) : [],
    pickupPoints: Array.isArray(r.pickupPoints) ? (r.pickupPoints as any[]) : [],
    supportedCurrencies: Array.isArray(r.supportedCurrencies) ? (r.supportedCurrencies as string[]) : ["BDT"],
    internationalShipping: Boolean(r.internationalShipping ?? false),
    crossBorderSeller: Boolean(r.crossBorderSeller ?? false),
    createdAt: ts(r.createdAt),
    updatedAt: ts(r.updatedAt),
  };
}

// ====================================================================
// Profile Read
// ====================================================================

export async function getSellerProfile(uid: string): Promise<SellerProfile | null> {
  const snap = await getDoc(doc(getDb(), SELLERS, uid));
  return snap.exists() ? mapSeller(snap.id, snap.data()) : null;
}

// ====================================================================
// Registration: Initialize Draft
// ====================================================================

export interface SellerApplicationInit {
  uid: string;
  email: string | null;
}

export async function initSellerDraft(input: SellerApplicationInit): Promise<void> {
  const ref = doc(getDb(), SELLERS, input.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const status = existing.data().status as SellerStatus;
    if (status === "approved" || status === "pending_review") {
      throw new Error(
        status === "approved"
          ? "You are already an approved seller."
          : "Your application is already under review.",
      );
    }
    return; // Existing draft — continue from current step
  }
  await setDoc(ref, {
    uid: input.uid,
    email: input.email ?? "",
    status: "draft",
    currentStep: "store_info",
    commissionRate: 0.08,
    totalEarnings: 0,
    availableBalance: 0,
    pendingBalance: 0,
    withdrawnTotal: 0,
    bankInfo: {
      bankName: null, accountName: null, accountNumber: null,
      branchName: null, routingNumber: null,
      mobileBankingType: null, mobileBankingNumber: null,
    },
    identity: {
      fullName: null, nidNumber: null, nidFrontUrl: null,
      nidBackUrl: null, tradeLicenseUrl: null, tradeLicenseNumber: null,
      verified: false,
    },
    business: {
      businessType: null, businessName: null, taxId: null,
      website: null, socialMediaLinks: [],
    },
    storeSettings: {
      autoAcceptOrders: false, announcement: null,
      responseTimeHours: 24, returnPolicyDays: 7, operatingHours: null,
    },
    verified: false,
    totalProducts: 0, totalOrders: 0,
    rating: 0, ratingCount: 0, followers: 0,
    warehouses: [], pickupPoints: [],
    supportedCurrencies: ["BDT"],
    internationalShipping: false, crossBorderSeller: false,
    termsAccepted: false, termsAcceptedAt: null,
    submittedAt: null, approvedAt: null,
    rejectionReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ====================================================================
// Registration: Save Step Data
// ====================================================================

export interface StoreInfoInput {
  shopName: string;
  description: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  phone: string;
  addressLine: string;
  city: string;
  area?: string | null;
  country?: string;
  postalCode?: string | null;
}

export interface BusinessInfoInput {
  businessType: "individual" | "company" | "partnership";
  businessName: string;
  taxId?: string | null;
  website?: string | null;
  socialMediaLinks?: string[];
}

export interface IdentityInput {
  fullName: string;
  nidNumber: string;
  nidFrontUrl?: string | null;
  nidBackUrl?: string | null;
  tradeLicenseUrl?: string | null;
  tradeLicenseNumber?: string | null;
}

export interface BankingInput {
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  branchName?: string | null;
  routingNumber?: string | null;
  mobileBankingType?: "bkash" | "nagad" | "rocket" | null;
  mobileBankingNumber?: string | null;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

export async function saveStoreInfo(uid: string, input: StoreInfoInput): Promise<void> {
  const shopSlug = slugify(input.shopName) || uid;
  await updateDoc(doc(getDb(), SELLERS, uid), {
    shopName: input.shopName,
    shopSlug,
    description: input.description,
    logoUrl: input.logoUrl ?? null,
    bannerUrl: input.bannerUrl ?? null,
    phone: input.phone,
    addressLine: input.addressLine,
    city: input.city,
    area: input.area ?? null,
    country: input.country ?? "Bangladesh",
    postalCode: input.postalCode ?? null,
    currentStep: "business_info",
    updatedAt: serverTimestamp(),
  });
}

export async function saveBusinessInfo(uid: string, input: BusinessInfoInput): Promise<void> {
  await updateDoc(doc(getDb(), SELLERS, uid), {
    business: {
      businessType: input.businessType,
      businessName: input.businessName,
      taxId: input.taxId ?? null,
      website: input.website ?? null,
      socialMediaLinks: input.socialMediaLinks ?? [],
    },
    currentStep: "identity_verification",
    updatedAt: serverTimestamp(),
  });
}

export async function saveIdentityInfo(uid: string, input: IdentityInput): Promise<void> {
  await updateDoc(doc(getDb(), SELLERS, uid), {
    identity: {
      fullName: input.fullName,
      nidNumber: input.nidNumber,
      nidFrontUrl: input.nidFrontUrl ?? null,
      nidBackUrl: input.nidBackUrl ?? null,
      tradeLicenseUrl: input.tradeLicenseUrl ?? null,
      tradeLicenseNumber: input.tradeLicenseNumber ?? null,
      verified: false,
    },
    currentStep: "banking",
    updatedAt: serverTimestamp(),
  });
}

export async function saveBankingInfo(uid: string, input: BankingInput): Promise<void> {
  await updateDoc(doc(getDb(), SELLERS, uid), {
    bankInfo: {
      bankName: input.bankName ?? null,
      accountName: input.accountName ?? null,
      accountNumber: input.accountNumber ?? null,
      branchName: input.branchName ?? null,
      routingNumber: input.routingNumber ?? null,
      mobileBankingType: input.mobileBankingType ?? null,
      mobileBankingNumber: input.mobileBankingNumber ?? null,
    },
    currentStep: "terms",
    updatedAt: serverTimestamp(),
  });
}

// ====================================================================
// Registration: Submit for Review
// ====================================================================

export async function submitForReview(uid: string): Promise<void> {
  const ref = doc(getDb(), SELLERS, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Seller profile not found.");
  const data = snap.data();
  if (data.status === "approved") throw new Error("Already approved.");
  if (data.status === "pending_review") throw new Error("Already under review.");
  if (!data.termsAccepted) throw new Error("Terms must be accepted before submission.");

  await updateDoc(ref, {
    status: "pending_review",
    currentStep: "submitted",
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ====================================================================
// Registration: Accept Terms
// ====================================================================

export async function acceptTerms(uid: string): Promise<void> {
  await updateDoc(doc(getDb(), SELLERS, uid), {
    termsAccepted: true,
    termsAcceptedAt: serverTimestamp(),
    currentStep: "submitted",
    updatedAt: serverTimestamp(),
  });
}

// ====================================================================
// Profile Update (Seller can edit only store info, not financial data)
// ====================================================================

export async function updateSellerProfile(
  uid: string,
  patch: Partial<Pick<SellerProfile, "shopName" | "description" | "logoUrl" | "bannerUrl" | "phone" | "addressLine" | "city" | "area" | "country" | "postalCode">>,
): Promise<void> {
  const update: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
  if (patch.shopName) {
    update.shopSlug = slugify(patch.shopName) || uid;
  }
  await updateDoc(doc(getDb(), SELLERS, uid), update);
}

// ====================================================================
// Notifications
// ====================================================================

function mapNotification(id: string, d: Record<string, unknown>): SellerNotification {
  const r = d as Record<string, unknown>;
  const ts = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "toMillis" in v) {
      return (v as { toMillis: () => number }).toMillis();
    }
    return nowMs();
  };
  return {
    id,
    type: (r.type as SellerNotificationType) ?? "system",
    title: String(r.title ?? ""),
    message: String(r.message ?? ""),
    link: (r.link as string | null) ?? null,
    read: Boolean(r.read),
    createdAt: ts(r.createdAt),
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
