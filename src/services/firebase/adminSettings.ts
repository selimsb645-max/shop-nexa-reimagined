import {
  addDoc,
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
import { getDb, getStorageBucket } from "./config";
import { getDownloadURL, ref as sref, uploadBytes } from "firebase/storage";
import type { Banner, SiteSettings } from "@/types/admin";

const SETTINGS_COL = "settings";
const SITE_DOC = "site";
const BANNERS = "banners";

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "AVENTA SHOP",
  supportEmail: "help.shopnexa@gmail.com",
  supportPhone: "+1 234 567 8900",
  whatsappNumber: "01324997271",
  facebookUrl: "https://www.facebook.com/profile.php?id=61592089432837",
  currency: "USD",
  shipping: { flatRate: 5, freeShippingThreshold: 50, enabled: true },
  cod: {
    enabled: true,
    minOrder: 0,
    maxOrder: 5000,
    note: "Cash on Delivery available for orders within our service areas.",
  },
  tax: {
    enabled: false,
    rate: 0,
    label: "VAT",
    perProductOverride: true,
  },
  commission: {
    defaultRate: 8,
    minWithdrawalAmount: 1000,
    holdPeriodDays: 7,
  },
  homepage: {
    heroHeadline: "Shop Smarter. Live Better.",
    heroSubheadline:
      "Everything you need in one place. Top quality products at unbeatable prices.",
    heroCtaLabel: "Shop Now",
    heroCtaLink: "/shop",
    featuredCategorySlugs: [],
  },
  updatedAt: Date.now(),
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const snap = await getDoc(doc(getDb(), SETTINGS_COL, SITE_DOC));
  if (!snap.exists()) return DEFAULT_SETTINGS;
  const d = snap.data() as Partial<SiteSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...d,
    shipping: { ...DEFAULT_SETTINGS.shipping, ...(d.shipping ?? {}) },
    cod: { ...DEFAULT_SETTINGS.cod, ...(d.cod ?? {}) },
    tax: { ...DEFAULT_SETTINGS.tax, ...(d.tax ?? {}) },
    homepage: { ...DEFAULT_SETTINGS.homepage, ...(d.homepage ?? {}) },
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
  };
}

export async function saveSiteSettings(patch: Partial<SiteSettings>): Promise<void> {
  await setDoc(
    doc(getDb(), SETTINGS_COL, SITE_DOC),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

// Banners
function mapBanner(id: string, d: Record<string, unknown>): Banner {
  const created = d.createdAt as { toMillis?: () => number } | number | undefined;
  return {
    id,
    title: String(d.title ?? ""),
    subtitle: String(d.subtitle ?? ""),
    imageUrl: String(d.imageUrl ?? ""),
    ctaLabel: String(d.ctaLabel ?? ""),
    ctaLink: String(d.ctaLink ?? "/shop"),
    position: (d.position as Banner["position"]) ?? "hero",
    active: Boolean(d.active),
    order: Number(d.order ?? 0),
    createdAt:
      typeof created === "number" ? created : created?.toMillis?.() ?? Date.now(),
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
  };
}

export async function listBanners(): Promise<Banner[]> {
  const snap = await getDocs(query(collection(getDb(), BANNERS), orderBy("order", "asc")));
  return snap.docs.map((d) => mapBanner(d.id, d.data()));
}

export interface BannerInput {
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel: string;
  ctaLink: string;
  position: Banner["position"];
  active: boolean;
  order: number;
}

export async function createBanner(input: BannerInput): Promise<string> {
  const ref = await addDoc(collection(getDb(), BANNERS), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBanner(id: string, patch: Partial<BannerInput>): Promise<void> {
  await updateDoc(doc(getDb(), BANNERS, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteBanner(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), BANNERS, id));
}

export async function uploadBannerImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be smaller than 8MB.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `banners/${crypto.randomUUID()}.${ext}`;
  const objectRef = sref(getStorageBucket(), path);
  await uploadBytes(objectRef, file, { contentType: file.type });
  return await getDownloadURL(objectRef);
}
