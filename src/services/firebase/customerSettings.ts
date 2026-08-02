import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "./config";
import { toMs } from "./timestamps";
import { DEFAULT_SETTINGS, type CustomerSettings } from "@/types/customer";

function ref(uid: string) {
  return doc(getDb(), "users", uid, "prefs", "settings");
}

export async function getCustomerSettings(uid: string): Promise<CustomerSettings> {
  const snap = await getDoc(ref(uid));
  if (!snap.exists()) return DEFAULT_SETTINGS;
  const d = snap.data() as Record<string, unknown>;
  return {
    emailOrderUpdates: d.emailOrderUpdates !== false,
    emailPromotions: Boolean(d.emailPromotions),
    smsOrderUpdates: d.smsOrderUpdates !== false,
    pushNotifications: d.pushNotifications !== false,
    currency: d.currency === "BDT" ? "BDT" : "USD",
    language: d.language === "bn" ? "bn" : "en",
    updatedAt: toMs(d.updatedAt, 0),
  };
}

export async function saveCustomerSettings(
  uid: string,
  patch: Partial<Omit<CustomerSettings, "updatedAt">>,
): Promise<void> {
  await setDoc(ref(uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}
