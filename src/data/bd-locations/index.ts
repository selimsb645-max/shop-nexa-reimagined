// Bangladesh Location Master Data - Central Export
// Sources:
//   - nuhil/bangladesh-geocode (sourced from bangladesh.gov.bd)
//   - TanjidulIslamToha/bangladesh-postal-codes-database (Bangladesh Post Office)
//
// Dataset version: 1.0.0
// Source updated at: 2024-01-01 (approximate - verify before production import)

import { divisions, divisionCount, type BDDivision } from "./divisions";
import { districts, districtCount, type BDDistrict } from "./districts";
import { upazilas, upazilaCount, type BDUpazila } from "./upazilas";
import { unions, unionCount, type BDUnion } from "./unions";
import { postOffices, postOfficeCount, type BDPostOffice } from "./postOffices";

export { divisions, divisionCount, type BDDivision };
export { districts, districtCount, type BDDistrict };
export { upazilas, upazilaCount, type BDUpazila };
export { unions, unionCount, type BDUnion };
export { postOffices, postOfficeCount, type BDPostOffice };

export const DATASET_VERSION = "1.0.0";
export const DATASET_SOURCE = "nuhil/bangladesh-geocode + TanjidulIslamToha/bangladesh-postal-codes-database";
export const DATASET_SOURCE_URL = "https://github.com/nuhil/bangladesh-geocode";

// ── Lookup helpers ──

export function getDivisionById(id: string): BDDivision | undefined {
  return divisions.find((d) => d.id === id);
}

export function getDistrictsByDivision(divisionId: string): BDDistrict[] {
  return districts.filter((d) => d.divisionId === divisionId);
}

export function getDistrictById(id: string): BDDistrict | undefined {
  return districts.find((d) => d.id === id);
}

export function getUpazilasByDistrict(districtId: string): BDUpazila[] {
  return upazilas.filter((u) => u.districtId === districtId);
}

export function getUpazilaById(id: string): BDUpazila | undefined {
  return upazilas.find((u) => u.id === id);
}

export function getUnionsByUpazila(upazilaId: string): BDUnion[] {
  return unions.filter((u) => u.upazilaId === upazilaId);
}

export function getUnionById(id: string): BDUnion | undefined {
  return unions.find((u) => u.id === id);
}

// Post office lookups - matched by district name + thana name
export function getPostOfficesByDistrict(districtEn: string): BDPostOffice[] {
  return postOffices.filter((p) => p.districtEn.toLowerCase() === districtEn.toLowerCase());
}

export function getPostOfficesByThana(districtEn: string, thanaEn: string): BDPostOffice[] {
  return postOffices.filter(
    (p) =>
      p.districtEn.toLowerCase() === districtEn.toLowerCase() &&
      p.thanaEn.toLowerCase() === thanaEn.toLowerCase()
  );
}

export function getPostOfficeByCode(postcode: string): BDPostOffice | undefined {
  return postOffices.find((p) => p.postcode === postcode);
}

// ── Cross-reference: match upazila name to post office thana ──
// Upazilas and Thanas are NOT always the same entity. Some areas have
// a Police Station (Thana) that differs from the administrative Upazila.
// We cross-reference by name to find applicable post offices.
export function getPostOfficesForUpazila(
  districtEn: string,
  upazilaEn: string
): BDPostOffice[] {
  // First try exact thana match with upazila name
  const exact = postOffices.filter(
    (p) =>
      p.districtEn.toLowerCase() === districtEn.toLowerCase() &&
      p.thanaEn.toLowerCase() === upazilaEn.toLowerCase()
  );
  if (exact.length > 0) return exact;

  // Fallback: return all post offices in the district (customer can pick)
  return getPostOfficesByDistrict(districtEn);
}

// ── Summary stats ──
export function getDatasetSummary() {
  return {
    version: DATASET_VERSION,
    source: DATASET_SOURCE,
    divisions: divisionCount,
    districts: districtCount,
    upazilas: upazilaCount,
    unions: unionCount,
    postOffices: postOfficeCount,
  };
}
