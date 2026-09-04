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
import type {
  SellerProfile,
  SellerStatus,
  RegistrationStep,
  SellerBankInfo,
  SellerIdentityInfo,
  SellerBusinessInfo,
  SellerStoreSettings,
  WarehouseInfo,
  PickupPoint,
} from "@/types/seller";

const SELLERS = "sellers";

function mapSeller(id: string, d: Record<string, unknown>): SellerProfile {
  const created = d.createdAt as { toMillis?: () => number } | number | undefined;
  const updatedRaw = d.updatedAt as { toMillis?: () => number } | number | undefined;
  return {
    uid: id,
    shopName: String(d.shopName ?? ""),
    shopSlug: String(d.shopSlug ?? id),
    description: String(d.description ?? ""),
    logoUrl: (d.logoUrl as string | null) ?? null,
    bannerUrl: (d.bannerUrl as string | null) ?? null,
    phone: String(d.phone ?? ""),
    email: String(d.email ?? ""),
    addressLine: String(d.addressLine ?? ""),
    city: String(d.city ?? ""),
    area: (d.area as string | null) ?? null,
    country: String(d.country ?? ""),
    postalCode: (d.postalCode as string | null) ?? null,
    status: (d.status as SellerStatus) ?? "pending",
    rejectionReason: (d.rejectionReason as string | null) ?? null,
    currentStep: (d.currentStep as RegistrationStep) ?? "terms",
    termsAccepted: Boolean(d.termsAccepted),
    termsAcceptedAt: (d.termsAcceptedAt as number | null) ?? null,
    submittedAt: (d.submittedAt as number | null) ?? null,
    approvedAt: (d.approvedAt as number | null) ?? null,
    commissionRate: Number(d.commissionRate ?? 10),
    totalEarnings: Number(d.totalEarnings ?? 0),
    availableBalance: Number(d.availableBalance ?? 0),
    pendingBalance: Number(d.pendingBalance ?? 0),
    withdrawnTotal: Number(d.withdrawnTotal ?? 0),
    bankInfo: (d.bankInfo as SellerBankInfo) ?? {
      bankName: null,
      accountName: null,
      accountNumber: null,
      branchName: null,
      routingNumber: null,
      mobileBankingType: null,
      mobileBankingNumber: null,
    },
    identity: (d.identity as SellerIdentityInfo) ?? {
      fullName: null,
      nidNumber: null,
      nidFrontUrl: null,
      nidBackUrl: null,
      tradeLicenseUrl: null,
      tradeLicenseNumber: null,
      verified: false,
    },
    business: (d.business as SellerBusinessInfo) ?? {
      businessType: null,
      businessName: null,
      taxId: null,
      website: null,
      socialMediaLinks: [],
    },
    storeSettings: (d.storeSettings as SellerStoreSettings) ?? {
      autoAcceptOrders: false,
      announcement: null,
      responseTimeHours: 24,
      returnPolicyDays: 7,
      operatingHours: null,
    },
    verified: Boolean(d.verified),
    totalProducts: Number(d.totalProducts ?? 0),
    totalOrders: Number(d.totalOrders ?? 0),
    rating: Number(d.rating ?? 0),
    ratingCount: Number(d.ratingCount ?? 0),
    followers: Number(d.followers ?? 0),
    warehouses: Array.isArray(d.warehouses) ? (d.warehouses as WarehouseInfo[]) : [],
    pickupPoints: Array.isArray(d.pickupPoints) ? (d.pickupPoints as PickupPoint[]) : [],
    supportedCurrencies: Array.isArray(d.supportedCurrencies)
      ? (d.supportedCurrencies as string[])
      : ["BDT"],
    internationalShipping: Boolean(d.internationalShipping),
    crossBorderSeller: Boolean(d.crossBorderSeller),
    createdAt: typeof created === "number" ? created : (created?.toMillis?.() ?? Date.now()),
    updatedAt:
      typeof updatedRaw === "number" ? updatedRaw : (updatedRaw?.toMillis?.() ?? Date.now()),
  };
}

export async function listAllSellers(): Promise<SellerProfile[]> {
  const snap = await getDocs(query(collection(getDb(), SELLERS), orderBy("createdAt", "desc")));
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
