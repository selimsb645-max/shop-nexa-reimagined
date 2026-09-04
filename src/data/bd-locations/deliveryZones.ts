/**
 * Aventa Shop — Centralized Delivery Zone Configuration
 *
 * Three delivery zones for Bangladesh:
 *   INSIDE_DHAKA   → ৳60  (Dhaka City Corporation / Metro)
 *   DHAKA_SUBURB   → ৳100 (Savar, Ashulia, Keraniganj, Gazipur, Tongi, Narayanganj, etc.)
 *   OUTSIDE_DHAKA  → ৳170 (Rest of Bangladesh)
 *
 * Admin can override charges or add/remove areas from any zone.
 *
 * DO NOT hardcode delivery charges anywhere else — always import from here.
 */

// ── Zone Types ──

export type DeliveryZoneId = "INSIDE_DHAKA" | "DHAKA_SUBURB" | "OUTSIDE_DHAKA";

export interface DeliveryZoneConfig {
  id: DeliveryZoneId;
  labelEn: string;
  labelBn: string;
  charge: number; // in BDT (৳)
  etaDays: [number, number];
  description: string;
}

// ── Zone Definitions (Admin-adjustable) ──

export const DELIVERY_ZONES: Record<DeliveryZoneId, DeliveryZoneConfig> = {
  INSIDE_DHAKA: {
    id: "INSIDE_DHAKA",
    labelEn: "Inside Dhaka City",
    labelBn: "ঢাকা শহরে",
    charge: 60,
    etaDays: [1, 2],
    description: "Dhaka City Corporation / Dhaka Metro area",
  },
  DHAKA_SUBURB: {
    id: "DHAKA_SUBURB",
    labelEn: "Dhaka Suburb",
    labelBn: "ঢাকার আশেপাশে",
    charge: 100,
    etaDays: [2, 3],
    description: "Savar, Ashulia, Keraniganj, Gazipur, Tongi, Narayanganj, etc.",
  },
  OUTSIDE_DHAKA: {
    id: "OUTSIDE_DHAKA",
    labelEn: "Outside Dhaka",
    labelBn: "ঢাকার বাইরে",
    charge: 170,
    etaDays: [3, 5],
    description: "Rest of Bangladesh",
  },
};

// ── Area Mappings ──

/**
 * INSIDE_DHAKA thanas (Dhaka City Corporation area).
 * These are the thanaEn values from post office data that fall within
 * Dhaka City Corporation / Dhaka Metro.
 */
export const DHAKA_CITY_THANAS = new Set([
  "Demra",
  "Dhaka",
  "Dhanmondi",
  "Gulshan",
  "Jatrabari",
  "Khilgaon",
  "Khilkhet",
  "Lalbag",
  "Mirpur",
  "Mohammadpur",
  "Motijheel",
  "New Market",
  "Palton",
  "Ramna",
  "Sabujbag",
  "Sutrapur",
  "Tejgaon",
  "Tejgaon Industrial Area",
  "Uttara",
]);

/**
 * DHAKA_SUBURB — upazila names (matched against upazilaEn or thanaEn).
 * These are areas near Dhaka that are NOT in the city corporation
 * but are serviceable as suburb delivery.
 */
export const DHAKA_SUBURB_UPAZILAS = new Set([
  // Dhaka district (non-city upazilas)
  "Savar",
  "Dhamrai",
  "Keraniganj",
  "Nawabganj",
  "Dohar",
  // Gazipur district
  "Gazipur Sadar",
  "Kaliakair",
  "Kaliganj",
  "Kapasia",
  "Sreepur",
  // Narayanganj district
  "Narayanganj Sadar",
  "Bandar",
  "Araihazar",
  "Rupganj",
  "Sonargaon",
  // Munshiganj (Tongibari is close to Dhaka)
  "Tongibari",
]);

/**
 * DHAKA_SUBURB — district names.
 * If the entire district is considered suburb (simpler matching).
 * Gazipur and Narayanganj districts are entirely suburb zone.
 */
export const DHAKA_SUBURB_DISTRICTS = new Set(["Gazipur", "Narayanganj"]);

/**
 * Districts that are part of Dhaka district (id 47).
 * The Dhaka district has both city and non-city areas, so we
 * need to check thana/upazila level for Dhaka district.
 */
export const DHAKA_DISTRICT_NAMES = new Set(["Dhaka"]);

// ── Zone Detection Logic ──

export interface DeliveryLocationInput {
  divisionEn?: string;
  districtEn?: string;
  upazilaEn?: string;
  thanaEn?: string;
  postOfficeEn?: string;
  postalCode?: string;
}

/**
 * Determine the delivery zone for a given location.
 * Returns the zone id and charge.
 *
 * Matching priority:
 * 1. If district is Gazipur or Narayanganj → DHAKA_SUBURB
 * 2. If district is Dhaka:
 *    a. If thana is in DHAKA_CITY_THANAS → INSIDE_DHAKA
 *    b. If upazila/thana is in DHAKA_SUBURB_UPAZILAS → DHAKA_SUBURB
 *    c. Default for Dhaka district → INSIDE_DHAKA (city corp)
 * 3. Everything else → OUTSIDE_DHAKA
 */
export function detectDeliveryZone(location: DeliveryLocationInput): {
  zone: DeliveryZoneId;
  charge: number;
  config: DeliveryZoneConfig;
} {
  const district = (location.districtEn ?? "").trim();
  const upazila = (location.upazilaEn ?? "").trim();
  const thana = (location.thanaEn ?? "").trim();

  // Check suburb districts first (Gazipur, Narayanganj = entire district is suburb)
  if (DHAKA_SUBURB_DISTRICTS.has(district)) {
    return {
      zone: "DHAKA_SUBURB",
      charge: DELIVERY_ZONES.DHAKA_SUBURB.charge,
      config: DELIVERY_ZONES.DHAKA_SUBURB,
    };
  }

  // Dhaka district — need thana/upazila level matching
  if (DHAKA_DISTRICT_NAMES.has(district)) {
    // Check if thana is a Dhaka city thana
    if (DHAKA_CITY_THANAS.has(thana)) {
      return {
        zone: "INSIDE_DHAKA",
        charge: DELIVERY_ZONES.INSIDE_DHAKA.charge,
        config: DELIVERY_ZONES.INSIDE_DHAKA,
      };
    }
    // Check if upazila/thana is a suburb upazila
    if (DHAKA_SUBURB_UPAZILAS.has(upazila) || DHAKA_SUBURB_UPAZILAS.has(thana)) {
      return {
        zone: "DHAKA_SUBURB",
        charge: DELIVERY_ZONES.DHAKA_SUBURB.charge,
        config: DELIVERY_ZONES.DHAKA_SUBURB,
      };
    }
    // Default: if it's in Dhaka district but not in suburb list, treat as city
    return {
      zone: "INSIDE_DHAKA",
      charge: DELIVERY_ZONES.INSIDE_DHAKA.charge,
      config: DELIVERY_ZONES.INSIDE_DHAKA,
    };
  }

  // Everything else is outside Dhaka
  return {
    zone: "OUTSIDE_DHAKA",
    charge: DELIVERY_ZONES.OUTSIDE_DHAKA.charge,
    config: DELIVERY_ZONES.OUTSIDE_DHAKA,
  };
}

/**
 * Get the delivery charge for a location (convenience function).
 */
export function getDeliveryCharge(location: DeliveryLocationInput): number {
  return detectDeliveryZone(location).charge;
}

/**
 * Get zone config by zone id.
 */
export function getZoneConfig(zoneId: DeliveryZoneId): DeliveryZoneConfig {
  return DELIVERY_ZONES[zoneId];
}
