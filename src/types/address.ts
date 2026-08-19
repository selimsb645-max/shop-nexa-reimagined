// ── Structured Bangladesh Address Types ───────────────────────────
// Used across customer addresses, checkout, seller pickup points,
// warehouse addresses, and order delivery address snapshots.

export type AddressType = "HOME" | "OFFICE" | "OTHER";

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

  thanaEn: string; // May differ from upazila
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

  // Structured location (cascading selector output)
  location: StructuredLocation;

  // Manual entry by customer
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

/** Helper: convert a StructuredAddress to a DeliveryAddressSnapshot */
export function toDeliverySnapshot(addr: StructuredAddress): DeliveryAddressSnapshot {
  return {
    fullName: addr.fullName,
    phone: addr.phone,
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
    detailedAddress: addr.detailedAddress,
    deliveryInstructions: addr.deliveryInstructions,
    fullAddress: formatFullAddress(addr.location, addr.detailedAddress),
  };
}
