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
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./config";
import { toMs } from "./timestamps";
import type { StructuredAddress, AddressType, StructuredLocation } from "@/types/address";

// ── Firestore paths ──
// Customer addresses: users/{uid}/addresses/{addressId}
// Pickup points:      sellers/{sellerId}/pickupPoints/{pointId}

function addrPath(uid: string) {
  return collection(getDb(), "users", uid, "addresses");
}

function mapAddress(id: string, data: Record<string, unknown>): StructuredAddress {
  const loc = (data.location ?? {}) as Record<string, unknown>;
  return {
    id,
    userId: String(data.userId ?? ""),
    label: String(data.label ?? "Home"),
    addressType: (data.addressType as AddressType) ?? "HOME",
    fullName: String(data.fullName ?? ""),
    phone: String(data.phone ?? ""),
    alternativePhone: (data.alternativePhone as string | null) ?? null,
    location: {
      divisionId: String(loc.divisionId ?? ""),
      divisionEn: String(loc.divisionEn ?? ""),
      divisionBn: String(loc.divisionBn ?? ""),
      districtId: String(loc.districtId ?? ""),
      districtEn: String(loc.districtEn ?? ""),
      districtBn: String(loc.districtBn ?? ""),
      upazilaId: String(loc.upazilaId ?? ""),
      upazilaEn: String(loc.upazilaEn ?? ""),
      upazilaBn: String(loc.upazilaBn ?? ""),
      thanaEn: String(loc.thanaEn ?? ""),
      thanaBn: String(loc.thanaBn ?? ""),
      unionId: String(loc.unionId ?? ""),
      unionEn: String(loc.unionEn ?? ""),
      unionBn: String(loc.unionBn ?? ""),
      postOfficeEn: String(loc.postOfficeEn ?? ""),
      postOfficeBn: String(loc.postOfficeBn ?? ""),
      postalCode: String(loc.postalCode ?? ""),
    },
    house: String(data.house ?? ""),
    road: String(data.road ?? ""),
    block: (data.block as string | null) ?? null,
    floor: (data.floor as string | null) ?? null,
    landmark: (data.landmark as string | null) ?? null,
    villageArea: (data.villageArea as string | null) ?? null,
    detailedAddress: String(data.detailedAddress ?? ""),
    deliveryInstructions: String(data.deliveryInstructions ?? ""),
    latitude: (data.latitude as number) ?? null,
    longitude: (data.longitude as number) ?? null,
    isDefault: Boolean(data.isDefault),
    createdAt: toMs(data.createdAt),
    updatedAt: toMs(data.updatedAt),
  };
}

export interface StructuredAddressInput {
  label: string;
  addressType: AddressType;
  fullName: string;
  phone: string;
  alternativePhone: string | null;
  location: StructuredLocation;
  house: string;
  road: string;
  block: string | null;
  floor: string | null;
  landmark: string | null;
  villageArea: string | null;
  detailedAddress: string;
  deliveryInstructions: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

// ── Customer Addresses ──

export async function listStructuredAddresses(uid: string): Promise<StructuredAddress[]> {
  const snap = await getDocs(query(addrPath(uid), orderBy("createdAt", "desc")));
  const items = snap.docs.map((d) => mapAddress(d.id, d.data() as Record<string, unknown>));
  return items.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export async function getDefaultStructuredAddress(uid: string): Promise<StructuredAddress | null> {
  const all = await listStructuredAddresses(uid);
  return all.find((a) => a.isDefault) ?? all[0] ?? null;
}

export async function saveStructuredAddress(
  uid: string,
  input: StructuredAddressInput,
  id?: string,
): Promise<string> {
  const db = getDb();
  const ref = id ? doc(db, "users", uid, "addresses", id) : doc(addrPath(uid));
  const exists = id ? (await getDoc(ref)).exists() : false;

  await setDoc(
    ref,
    {
      userId: uid,
      label: input.label,
      addressType: input.addressType,
      fullName: input.fullName,
      phone: input.phone,
      alternativePhone: input.alternativePhone,
      location: input.location,
      house: input.house,
      road: input.road,
      block: input.block,
      floor: input.floor,
      landmark: input.landmark,
      villageArea: input.villageArea,
      detailedAddress: input.detailedAddress,
      deliveryInstructions: input.deliveryInstructions,
      latitude: input.latitude,
      longitude: input.longitude,
      isDefault: input.isDefault,
      createdAt: exists ? undefined : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (input.isDefault) await setDefaultStructuredAddress(uid, ref.id);
  return ref.id;
}

export async function setDefaultStructuredAddress(uid: string, id: string): Promise<void> {
  const snap = await getDocs(addrPath(uid));
  const batch = writeBatch(getDb());
  snap.docs.forEach((d) => {
    batch.update(d.ref, { isDefault: d.id === id, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function deleteStructuredAddress(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), "users", uid, "addresses", id));
}

// ── Seller Pickup Points ──

import type { PickupPoint } from "@/types/address";

function pickupPath(sellerId: string) {
  return collection(getDb(), "sellers", sellerId, "pickupPoints");
}

function mapPickupPoint(id: string, data: Record<string, unknown>): PickupPoint {
  const loc = (data.location ?? {}) as Record<string, unknown>;
  return {
    id,
    sellerId: String(data.sellerId ?? ""),
    label: String(data.label ?? ""),
    location: {
      divisionId: String(loc.divisionId ?? ""),
      divisionEn: String(loc.divisionEn ?? ""),
      divisionBn: String(loc.divisionBn ?? ""),
      districtId: String(loc.districtId ?? ""),
      districtEn: String(loc.districtEn ?? ""),
      districtBn: String(loc.districtBn ?? ""),
      upazilaId: String(loc.upazilaId ?? ""),
      upazilaEn: String(loc.upazilaEn ?? ""),
      upazilaBn: String(loc.upazilaBn ?? ""),
      thanaEn: String(loc.thanaEn ?? ""),
      thanaBn: String(loc.thanaBn ?? ""),
      unionId: String(loc.unionId ?? ""),
      unionEn: String(loc.unionEn ?? ""),
      unionBn: String(loc.unionBn ?? ""),
      postOfficeEn: String(loc.postOfficeEn ?? ""),
      postOfficeBn: String(loc.postOfficeBn ?? ""),
      postalCode: String(loc.postalCode ?? ""),
    },
    detailedAddress: String(data.detailedAddress ?? ""),
    contactName: String(data.contactName ?? ""),
    contactPhone: String(data.contactPhone ?? ""),
    isActive: Boolean(data.isActive ?? true),
    isDefault: Boolean(data.isDefault ?? false),
    createdAt: toMs(data.createdAt),
    updatedAt: toMs(data.updatedAt),
  };
}

export async function listPickupPoints(sellerId: string): Promise<PickupPoint[]> {
  const snap = await getDocs(query(pickupPath(sellerId), orderBy("createdAt", "desc")));
  const items = snap.docs.map((d) => mapPickupPoint(d.id, d.data() as Record<string, unknown>));
  return items.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export interface PickupPointInput {
  label: string;
  location: StructuredLocation;
  detailedAddress: string;
  contactName: string;
  contactPhone: string;
  isActive: boolean;
  isDefault: boolean;
}

export async function savePickupPoint(
  sellerId: string,
  input: PickupPointInput,
  id?: string,
): Promise<string> {
  const db = getDb();
  const ref = id ? doc(db, "sellers", sellerId, "pickupPoints", id) : doc(pickupPath(sellerId));
  const exists = id ? (await getDoc(ref)).exists() : false;

  await setDoc(
    ref,
    {
      sellerId,
      label: input.label,
      location: input.location,
      detailedAddress: input.detailedAddress,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      isActive: input.isActive,
      isDefault: input.isDefault,
      createdAt: exists ? undefined : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (input.isDefault) {
    const snap = await getDocs(pickupPath(sellerId));
    const batch = writeBatch(getDb());
    snap.docs.forEach((d) => {
      batch.update(d.ref, { isDefault: d.id === ref.id, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }

  return ref.id;
}

export async function deletePickupPoint(sellerId: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), "sellers", sellerId, "pickupPoints", id));
}
