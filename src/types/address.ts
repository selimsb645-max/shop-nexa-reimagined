// ── Structured Bangladesh Address Types ───────────────────────────
// Used across customer addresses, checkout, seller pickup points,
// warehouse addresses, and order delivery address snapshots.
//
// Location hierarchy:
//   Division → District → Upazila/Thana → Union → Post Office → Postal Code
//
// Village/mouza-level data is NOT included because no complete verified
// open-source dataset exists for Bangladesh's ~64,000 villages.
// The "detailedAddress" field captures specific house/road/village info.

export type AddressType =
  | "HOME"
  | "OFFICE"
  | "SHOP"
  | "SCHOOL"
  | "FACTORY"
  | "HOTEL"
  | "COURIER"
  | "STORE_PICKUP"
  | "RELATIVE"
  | "OTHER";

export const ADDRESS_TYPE_META: Record<AddressType, { labelEn: string; labelBn: string; icon: string }> = {
  HOME:         { labelEn: "Home",        labelBn: "বাসা / বাড়ি / ফ্ল্যাট",       icon: "🏠" },
  OFFICE:       { labelEn: "Office",      labelBn: "অফিস / কর্মস্থল",             icon: "🏢" },
  SHOP:         { labelEn: "Shop",        labelBn: "দোকান / ব্যবসা প্রতিষ্ঠান",    icon: "🏪" },
  SCHOOL:       { labelEn: "School",      labelBn: "শিক্ষা প্রতিষ্ঠান",           icon: "🎓" },
  FACTORY:      { labelEn: "Factory",     labelBn: "কারখানা / কর্মস্থল",          icon: "🏭" },
  HOTEL:        { labelEn: "Hotel",       labelBn: "হোটেল / গেস্ট হাউস",          icon: "🏨" },
  COURIER:      { labelEn: "Courier",     labelBn: "কুরিয়ার / পিকআপ পয়েন্ট",     icon: "📦" },
  STORE_PICKUP: { labelEn: "Store Pickup",labelBn: "Shop Nexa স্টোর / শাখা",      icon: "🏬" },
  RELATIVE:     { labelEn: "Relative",    labelBn: "অন্য কারও ঠিকানায়",          icon: "👨‍👩‍👧" },
  OTHER:        { labelEn: "Other",       labelBn: "কাস্টম ঠিকানা",               icon: "📍" },
};

export type LocationType =
  | "country"
  | "division"
  | "district"
  | "upazila"
  | "thana"
  | "union"
  | "municipality"
  | "cityCorporation"
  | "ward"
  | "mouza"
  | "village"
  | "postOffice"
  | "postalCode";

/** A single selectable location in the hierarchy */
export interface LocationItem {
  id: string;
  nameEn: string;
  nameBn: string;
  type: LocationType;
  parentId: string;
  parentType: LocationType;
  isActive: boolean;
}

/** Structured location data stored in every address */
export interface StructuredLocation {
  divisionId: string;
  divisionEn: string;
  divisionBn: string;

  districtId: string;
  districtEn: string;
  districtBn: string;

  upazilaId: string;
  upazilaEn: string;
  upazilaBn: string;

  thanaEn: string;
  thanaBn: string;

  unionId: string;
  unionEn: string;
  unionBn: string;

  postOfficeEn: string;
  postOfficeBn: string;
  postalCode: string;
}

/** Full address with structured location + manual fields */
export interface StructuredAddress {
  id: string;
  userId: string;
  label: string;
  addressType: AddressType;

  fullName: string;
  phone: string;
  alternativePhone: string | null;

  // Structured location (cascading selector output)
  location: StructuredLocation;

  // Manual entry by customer — specific delivery point
  house: string;
  road: string;
  block: string | null;
  floor: string | null;
  landmark: string | null;

  // Village / Area / Locality — manually entered by customer
  villageArea: string | null;

  // Combined detailed address (for backward compat / courier labels)
  detailedAddress: string;

  deliveryInstructions: string;

  // Coordinates (optional, for courier APIs)
  latitude: number | null;
  longitude: number | null;

  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Immutable snapshot stored with an order at checkout time */
export interface DeliveryAddressSnapshot {
  fullName: string;
  phone: string;
  alternativePhone: string | null;
  addressType: AddressType;

  divisionEn: string;
  divisionBn: string;
  districtEn: string;
  districtBn: string;
  upazilaEn: string;
  upazilaBn: string;
  thanaEn: string;
  thanaBn: string;
  unionEn: string;
  unionBn: string;
  postOfficeEn: string;
  postOfficeBn: string;
  postalCode: string;
  house: string;
  road: string;
  block: string | null;
  floor: string | null;
  landmark: string | null;
  villageArea: string | null;
  detailedAddress: string;
  deliveryInstructions: string;

  // Full formatted address for courier labels
  fullAddress: string;
}

/** Seller pickup point / warehouse address (reuses same structure) */
export interface PickupPoint {
  id: string;
  sellerId: string;
  label: string;
  location: StructuredLocation;
  detailedAddress: string;
  contactName: string;
  contactPhone: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── Bangladesh Phone Validation & Normalization ──

/**
 * Validates a Bangladesh phone number.
 * Accepts: +8801XXXXXXXXX, 8801XXXXXXXXX, 01XXXXXXXXX
 */
export function isValidBDPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^(?:\+?8801|01)[0-9]{9}$/.test(cleaned);
}

/**
 * Normalizes a Bangladesh phone number to 01XXXXXXXXX format.
 * Returns null if invalid.
 */
export function normalizeBDPhone(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (!isValidBDPhone(cleaned)) return null;
  if (cleaned.startsWith("+8801")) return "0" + cleaned.slice(4);
  if (cleaned.startsWith("8801")) return "0" + cleaned.slice(3);
  return cleaned;
}

/** Helper: build a full formatted address string for courier labels */
export function formatFullAddress(loc: StructuredLocation, detailedAddress: string): string {
  const parts: string[] = [detailedAddress];
  if (loc.unionEn) parts.push(loc.unionEn);
  if (loc.upazilaEn) parts.push(loc.upazilaEn);
  if (loc.thanaEn && loc.thanaEn !== loc.upazilaEn) parts.push(`Thana: ${loc.thanaEn}`);
  if (loc.postOfficeEn) parts.push(loc.postOfficeEn);
  parts.push(`${loc.districtEn} - ${loc.postalCode}`);
  parts.push(loc.divisionEn);
  parts.push("Bangladesh");
  return parts.join(", ");
}

/** Helper: build detailed address from individual fields */
export function buildDetailedAddress(
  house: string,
  road: string,
  block?: string | null,
  floor?: string | null,
  landmark?: string | null,
  villageArea?: string | null,
): string {
  const parts: string[] = [];
  if (villageArea) parts.push(villageArea);
  if (house) parts.push(house);
  if (road) parts.push(road);
  if (block) parts.push(block);
  if (floor) parts.push(floor);
  if (landmark) parts.push(`Landmark: ${landmark}`);
  return parts.join(", ");
}

/** Helper: convert a StructuredAddress to a DeliveryAddressSnapshot */
export function toDeliverySnapshot(addr: StructuredAddress): DeliveryAddressSnapshot {
  return {
    fullName: addr.fullName,
    phone: addr.phone,
    alternativePhone: addr.alternativePhone,
    addressType: addr.addressType,
    divisionEn: addr.location.divisionEn,
    divisionBn: addr.location.divisionBn,
    districtEn: addr.location.districtEn,
    districtBn: addr.location.districtBn,
    upazilaEn: addr.location.upazilaEn,
    upazilaBn: addr.location.upazilaBn,
    thanaEn: addr.location.thanaEn,
    thanaBn: addr.location.thanaBn,
    unionEn: addr.location.unionEn,
    unionBn: addr.location.unionBn,
    postOfficeEn: addr.location.postOfficeEn,
    postOfficeBn: addr.location.postOfficeBn,
    postalCode: addr.location.postalCode,
    house: addr.house,
    road: addr.road,
    block: addr.block,
    floor: addr.floor,
    landmark: addr.landmark,
    villageArea: addr.villageArea,
    detailedAddress: addr.detailedAddress,
    deliveryInstructions: addr.deliveryInstructions,
    fullAddress: formatFullAddress(addr.location, addr.detailedAddress),
  };
}
