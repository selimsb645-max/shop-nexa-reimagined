import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";

export type ReturnStatus = "pending" | "approved" | "rejected" | "picked_up" | "refunded" | "cancelled";
export type ReturnReason = "damaged" | "wrong_item" | "not_as_described" | "changed_mind" | "quality_issue" | "other";

export interface ReturnRequest {
  id: string;
  orderId: string;
  userId: string;
  productId: string;
  productTitle: string;
  productImage: string;
  reason: ReturnReason;
  description: string;
  status: ReturnStatus;
  refundAmount: number;
  images: string[];
  createdAt: number;
  updatedAt: number;
}

export async function createReturnRequest(
  uid: string,
  data: {
    orderId: string;
    productId: string;
    productTitle: string;
    productImage: string;
    reason: ReturnReason;
    description: string;
    refundAmount: number;
    images?: string[];
  },
): Promise<string> {
  const db = getDb();
  const ref = await addDoc(collection(db, "returns"), {
    ...data,
    userId: uid,
    status: "pending" as ReturnStatus,
    images: data.images ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listUserReturns(uid: string): Promise<ReturnRequest[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, "returns"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      orderId: String(data.orderId ?? ""),
      userId: String(data.userId ?? ""),
      productId: String(data.productId ?? ""),
      productTitle: String(data.productTitle ?? ""),
      productImage: String(data.productImage ?? ""),
      reason: (data.reason as ReturnReason) ?? "other",
      description: String(data.description ?? ""),
      status: (data.status as ReturnStatus) ?? "pending",
      refundAmount: Number(data.refundAmount ?? 0),
      images: Array.isArray(data.images) ? (data.images as string[]) : [],
      createdAt:
        typeof data.createdAt === "number"
          ? data.createdAt
          : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
      updatedAt:
        typeof data.updatedAt === "number"
          ? data.updatedAt
          : (data.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
    };
  });
}

export async function getReturnRequest(id: string): Promise<ReturnRequest | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "returns", id));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    orderId: String(data.orderId ?? ""),
    userId: String(data.userId ?? ""),
    productId: String(data.productId ?? ""),
    productTitle: String(data.productTitle ?? ""),
    productImage: String(data.productImage ?? ""),
    reason: (data.reason as ReturnReason) ?? "other",
    description: String(data.description ?? ""),
    status: (data.status as ReturnStatus) ?? "pending",
    refundAmount: Number(data.refundAmount ?? 0),
    images: Array.isArray(data.images) ? (data.images as string[]) : [],
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
    updatedAt:
      typeof data.updatedAt === "number"
        ? data.updatedAt
        : (data.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
  };
}

export async function cancelReturnRequest(id: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "returns", id), {
    status: "cancelled" as ReturnStatus,
    updatedAt: serverTimestamp(),
  });
}
