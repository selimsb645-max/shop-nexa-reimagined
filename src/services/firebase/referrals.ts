import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getDb } from "./config";
import { toMs } from "./timestamps";
import { addRewardTx } from "./wallet";
import type { ReferralRecord } from "@/types/customer";

export const REFERRAL_BONUS_POINTS = 500;
export const REFERRAL_WELCOME_POINTS = 250;

/** Deterministic, shareable code derived from the user id. */
export function referralCodeFor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) % 2176782336; // 36^6
  }
  return `NEXA${hash.toString(36).toUpperCase().padStart(6, "0")}`;
}

export function referralLink(uid: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/register?ref=${referralCodeFor(uid)}`;
}

function col(uid: string) {
  return collection(getDb(), "users", uid, "referrals");
}

function map(id: string, d: Record<string, unknown>): ReferralRecord {
  return {
    id,
    referredUserId: String(d.referredUserId ?? ""),
    referredName: String(d.referredName ?? "New customer"),
    status: d.status === "ordered" ? "ordered" : "joined",
    createdAt: toMs(d.createdAt),
  };
}

export async function listReferrals(uid: string): Promise<ReferralRecord[]> {
  const snap = await getDocs(query(col(uid), orderBy("createdAt", "desc"), limit(100)));
  return snap.docs.map((d) => map(d.id, d.data() as Record<string, unknown>));
}

/** Find the owner of a referral code by scanning stored codes on user profiles. */
export async function findUserByReferralCode(code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const snap = await getDocs(
    query(collection(getDb(), "users"), where("referralCode", "==", normalized), limit(1)),
  );
  return snap.empty ? null : snap.docs[0].id;
}

/** Store the caller's own referral code so their link can be resolved. */
export async function ensureReferralCode(uid: string): Promise<string> {
  const code = referralCodeFor(uid);
  const ref = doc(getDb(), "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists() || (snap.data() as { referralCode?: string }).referralCode !== code) {
    await setDoc(ref, { referralCode: code, updatedAt: serverTimestamp() }, { merge: true });
  }
  return code;
}

/**
 * Apply a friend's referral code: records the referral for the referrer and
 * credits welcome points to the current user. Runs once per account.
 */
export async function applyReferralCode(input: {
  uid: string;
  displayName: string | null;
  code: string;
}): Promise<void> {
  const me = doc(getDb(), "users", input.uid);
  const meSnap = await getDoc(me);
  if ((meSnap.data() as { referredBy?: string } | undefined)?.referredBy)
    throw new Error("You have already used a referral code");

  const referrerId = await findUserByReferralCode(input.code);
  if (!referrerId) throw new Error("Referral code not found");
  if (referrerId === input.uid) throw new Error("You cannot use your own code");

  await setDoc(
    doc(getDb(), "users", referrerId, "referrals", input.uid),
    {
      referredUserId: input.uid,
      referredName: input.displayName ?? "New customer",
      status: "joined",
      bonusPoints: REFERRAL_BONUS_POINTS,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    me,
    { referredBy: input.code.trim().toUpperCase(), updatedAt: serverTimestamp() },
    { merge: true },
  );

  await addRewardTx(input.uid, {
    type: "referral",
    points: REFERRAL_WELCOME_POINTS,
    note: `Welcome bonus for joining with ${input.code.trim().toUpperCase()}`,
  });
}

export async function getMyReferredBy(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(getDb(), "users", uid));
  return (snap.data() as { referredBy?: string } | undefined)?.referredBy ?? null;
}
