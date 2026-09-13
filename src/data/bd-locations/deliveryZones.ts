/**
 * AVENTA SHOP — Centralized Delivery Zone Configuration
 *
 * Three delivery zones for Bangladesh:
 *   INSIDE_DHAKA   → ৳60  (Dhaka City Corporation / Metro)
 *   DHAKA_SUBURB   → ৳100 (Savar, Ashulia, Keraniganj, Gazipur, Tongi, Narayanganj, etc.)
 *   OUTSIDE_DHAKA  → ৳170 (Rest of Bangladesh)
 *
 * Admin can override charges, enable/disable zones, and add/remove areas via
 * the Admin Delivery Zones UI (stored in Firestore settings/site.deliveryZones).
 *
 * DO NOT hardcode delivery charges anywhere else — always import from here
 * or read from Firestore settings.
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
  active: boolean;
  priority: number;
}

// ── Default Zone Definitions (fallback when Firestore settings unavailable) ──

export const DELIVERY_ZONES: Record<DeliveryZoneId, DeliveryZoneConfig> = {
  INSIDE_DHAKA: {
    id: "INSIDE_DHAKA",
    labelEn: "Inside Dhaka City",
    labelBn: "ঢাকা শহরে",
    charge: 60,
    etaDays: [1, 2],
    description: "Dhaka City Corporation / Dhaka Metro area",
    active: true,
    priority: 1,
  },
  DHAKA_SUBURB: {
    id: "DHAKA_SUBURB",
    labelEn: "Dhaka Suburb",
    labelBn: "ঢাকার আশেপাশে",
    charge: 100,
    etaDays: [2, 3],
    description: "Savar, Ashulia, Keraniganj, Gazipur, Tongi, Narayanganj, etc.",
    active: true,
    priority: 2,
  },
  OUTSIDE_DHAKA: {
    id: "OUTSIDE_DHAKA",
    labelEn: "Outside Dhaka",
    labelBn: "ঢাকার বাইরে",
    charge: 170,
    etaDays: [3, 5],
    description: "Rest of Bangladesh",
    active: true,
    priority: 3,
  },
};

// ── Area Mappings ──

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

export const DHAKA_SUBURB_UPAZILAS = new Set([
  "Savar",
  "Dhamrai",
  "Keraniganj",
  "Nawabganj",
  "Dohar",
  "Gazipur Sadar",
  "Kaliakair",
  "Kaliganj",
  "Kapasia",
  "Sreepur",
  "Narayanganj Sadar",
  "Bandar",
  "Araihazar",
  "Rupganj",
  "Sonargaon",
  "Tongibari",
]);

export const DHAKA_SUBURB_DISTRICTS = new Set(["Gazipur", "Narayanganj"]);

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
 * Detect which zone a location belongs to (zone ID only — does NOT read charge).
 * Charge must come from admin-configured Firestore settings, not hardcoded here.
 */
export function detectDeliveryZoneId(location: DeliveryLocationInput): DeliveryZoneId {
  const district = (location.districtEn ?? "").trim();
  const upazila = (location.upazilaEn ?? "").trim();
  const thana = (location.thanaEn ?? "").trim();

  if (DHAKA_SUBURB_DISTRICTS.has(district)) {
    return "DHAKA_SUBURB";
  }

  if (DHAKA_DISTRICT_NAMES.has(district)) {
    if (DHAKA_CITY_THANAS.has(thana)) {
      return "INSIDE_DHAKA";
    }
    if (DHAKA_SUBURB_UPAZILAS.has(upazila) || DHAKA_SUBURB_UPAZILAS.has(thana)) {
      return "DHAKA_SUBURB";
    }
    return "INSIDE_DHAKA";
  }

  return "OUTSIDE_DHAKA";
}

/**
 * Backward-compatible: detect zone AND return charge from default DELIVERY_ZONES.
 * For server-side use where admin-configured charges are needed, use
 * resolveZoneWithSettings() instead.
 */
export function detectDeliveryZone(location: DeliveryLocationInput): {
  zone: DeliveryZoneId;
  charge: number;
  config: DeliveryZoneConfig;
} {
  const zone = detectDeliveryZoneId(location);
  const config = DELIVERY_ZONES[zone];
  return { zone, charge: config.charge, config };
}

/**
 * Resolve a zone using admin-configured settings from Firestore.
 * This is the authoritative path — charges come from admin config, not hardcoded.
 *
 * `settingsZones` is the deliveryZones.zones array from site settings.
 * Falls back to DELIVERY_ZONES defaults if a zone is not found in settings.
 */
export function resolveZoneWithSettings(
  location: DeliveryLocationInput,
  settingsZones: Array<{
    id: string;
    labelEn: string;
    labelBn: string;
    charge: number;
    etaDays: [number, number];
    description: string;
    active: boolean;
    priority: number;
  }>,
  fallbackConfig?: { fallbackZoneId: string; noZoneBehavior: "block" | "fallback" },
): {
  zone: DeliveryZoneId;
  charge: number;
  label: string;
  labelBn: string;
  etaDays: [number, number];
  zoneId: string;
  zoneName: string;
  resolved: boolean;
} {
  const detectedZone = detectDeliveryZoneId(location);

  // Find the zone in admin-configured settings
  const settingsZone = settingsZones.find((z) => z.id === detectedZone);

  if (settingsZone) {
    if (!settingsZone.active) {
      // Zone is disabled — check fallback behavior
      if (fallbackConfig?.noZoneBehavior === "block") {
        return {
          zone: detectedZone,
          charge: 0,
          label: settingsZone.labelEn,
          labelBn: settingsZone.labelBn,
          etaDays: settingsZone.etaDays,
          zoneId: settingsZone.id,
          zoneName: settingsZone.labelEn,
          resolved: false,
        };
      }
      // Fallback to fallback zone
      const fbZone = settingsZones.find((z) => z.id === fallbackConfig?.fallbackZoneId);
      if (fbZone && fbZone.active) {
        return {
          zone: fbZone.id as DeliveryZoneId,
          charge: fbZone.charge,
          label: fbZone.labelEn,
          labelBn: fbZone.labelBn,
          etaDays: fbZone.etaDays,
          zoneId: fbZone.id,
          zoneName: fbZone.labelEn,
          resolved: true,
        };
      }
    }

    return {
      zone: detectedZone,
      charge: settingsZone.charge,
      label: settingsZone.labelEn,
      labelBn: settingsZone.labelBn,
      etaDays: settingsZone.etaDays,
      zoneId: settingsZone.id,
      zoneName: settingsZone.labelEn,
      resolved: true,
    };
  }

  // Zone not in settings — fall back to defaults
  const defaultConfig = DELIVERY_ZONES[detectedZone];
  return {
    zone: detectedZone,
    charge: defaultConfig.charge,
    label: defaultConfig.labelEn,
    labelBn: defaultConfig.labelBn,
    etaDays: defaultConfig.etaDays,
    zoneId: defaultConfig.id,
    zoneName: defaultConfig.labelEn,
    resolved: true,
  };
}

/**
 * Get the delivery charge for a location (convenience function).
 * Uses default DELIVERY_ZONES — for admin-configured charges, use resolveZoneWithSettings.
 */
export function getDeliveryCharge(location: DeliveryLocationInput): number {
  return detectDeliveryZone(location).charge;
}

/**
 * Get zone config by zone id (from defaults).
 */
export function getZoneConfig(zoneId: DeliveryZoneId): DeliveryZoneConfig {
  return DELIVERY_ZONES[zoneId];
}
