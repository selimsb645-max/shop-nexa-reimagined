// Location Data Validation Script
// Run this before importing location data to Firestore
// Validates: duplicates, orphan records, invalid parent-child relationships

import {
  divisions,
  districts,
  upazilas,
  unions,
  postOffices,
  DATASET_VERSION,
  DATASET_SOURCE,
} from "@/data/bd-locations";

export interface ValidationReport {
  totalRecords: number;
  byType: Record<string, number>;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  passed: boolean;
  version: string;
  source: string;
}

interface ValidationIssue {
  type: string;
  id: string;
  field: string;
  message: string;
}

export function validateLocationData(): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // ── Divisions ──
  const divisionIds = new Set<string>();
  const divisionNames = new Map<string, string>();

  for (const d of divisions) {
    if (divisionIds.has(d.id)) {
      errors.push({ type: "division", id: d.id, field: "id", message: "Duplicate division ID" });
    }
    divisionIds.add(d.id);

    if (!d.nameEn)
      errors.push({ type: "division", id: d.id, field: "nameEn", message: "Missing English name" });
    if (!d.nameBn)
      errors.push({ type: "division", id: d.id, field: "nameBn", message: "Missing Bengali name" });

    const key = d.nameEn.toLowerCase();
    if (divisionNames.has(key)) {
      warnings.push({
        type: "division",
        id: d.id,
        field: "nameEn",
        message: `Duplicate name: ${d.nameEn} (also id: ${divisionNames.get(key)})`,
      });
    }
    divisionNames.set(key, d.id);
  }

  // ── Districts ──
  const districtIds = new Set<string>();
  const districtNameByDivision = new Map<string, string>();

  for (const d of districts) {
    if (districtIds.has(d.id)) {
      errors.push({ type: "district", id: d.id, field: "id", message: "Duplicate district ID" });
    }
    districtIds.add(d.id);

    if (!divisionIds.has(d.divisionId)) {
      errors.push({
        type: "district",
        id: d.id,
        field: "divisionId",
        message: `Invalid parent division: ${d.divisionId}`,
      });
    }

    if (!d.nameEn)
      errors.push({ type: "district", id: d.id, field: "nameEn", message: "Missing English name" });
    if (!d.nameBn)
      errors.push({ type: "district", id: d.id, field: "nameBn", message: "Missing Bengali name" });

    const dupKey = `${d.divisionId}:${d.nameEn.toLowerCase()}`;
    if (districtNameByDivision.has(dupKey)) {
      warnings.push({
        type: "district",
        id: d.id,
        field: "nameEn",
        message: `Duplicate name in division ${d.divisionId}: ${d.nameEn}`,
      });
    }
    districtNameByDivision.set(dupKey, d.id);
  }

  // ── Upazilas ──
  const upazilaIds = new Set<string>();
  const upazilaNameByDistrict = new Map<string, string>();

  for (const u of upazilas) {
    if (upazilaIds.has(u.id)) {
      errors.push({ type: "upazila", id: u.id, field: "id", message: "Duplicate upazila ID" });
    }
    upazilaIds.add(u.id);

    if (!districtIds.has(u.districtId)) {
      errors.push({
        type: "upazila",
        id: u.id,
        field: "districtId",
        message: `Invalid parent district: ${u.districtId}`,
      });
    }

    const dupKey = `${u.districtId}:${u.nameEn.toLowerCase()}`;
    if (upazilaNameByDistrict.has(dupKey)) {
      warnings.push({
        type: "upazila",
        id: u.id,
        field: "nameEn",
        message: `Duplicate name in district ${u.districtId}: ${u.nameEn}`,
      });
    }
    upazilaNameByDistrict.set(dupKey, u.id);
  }

  // ── Unions ──
  const unionIds = new Set<string>();
  let unionDupCount = 0;

  for (const u of unions) {
    if (unionIds.has(u.id)) {
      unionDupCount++;
      errors.push({ type: "union", id: u.id, field: "id", message: "Duplicate union ID" });
    }
    unionIds.add(u.id);

    if (!upazilaIds.has(u.upazilaId)) {
      errors.push({
        type: "union",
        id: u.id,
        field: "upazilaId",
        message: `Invalid parent upazila: ${u.upazilaId}`,
      });
    }
  }

  // ── Post Offices ──
  const postcodeSet = new Set<string>();
  for (const p of postOffices) {
    if (postcodeSet.has(p.postcode)) {
      // Same postcode with different sub-offices is OK (multiple post offices can share a code)
      // Only flag if everything is identical
      warnings.push({
        type: "postOffice",
        id: p.postcode,
        field: "postcode",
        message: `Shared postcode: ${p.postcode} (${p.subofficeEn})`,
      });
    }
    postcodeSet.add(p.postcode);

    if (!p.postcode)
      errors.push({
        type: "postOffice",
        id: p.subofficeEn,
        field: "postcode",
        message: "Missing postal code",
      });
    if (!p.districtEn)
      errors.push({
        type: "postOffice",
        id: p.postcode,
        field: "districtEn",
        message: "Missing district name",
      });
    if (!p.divisionEn)
      errors.push({
        type: "postOffice",
        id: p.postcode,
        field: "divisionEn",
        message: "Missing division name",
      });
  }

  // ── Cross-reference: Post office divisions/districts should exist ──
  const divisionNamesSet = new Set(divisions.map((d) => d.nameEn.toLowerCase()));
  const districtNamesSet = new Set(districts.map((d) => d.nameEn.toLowerCase()));

  for (const p of postOffices) {
    if (p.divisionEn && !divisionNamesSet.has(p.divisionEn.toLowerCase())) {
      warnings.push({
        type: "postOffice",
        id: p.postcode,
        field: "divisionEn",
        message: `Division not found in master: ${p.divisionEn}`,
      });
    }
    if (p.districtEn && !districtNamesSet.has(p.districtEn.toLowerCase())) {
      warnings.push({
        type: "postOffice",
        id: p.postcode,
        field: "districtEn",
        message: `District not found in master: ${p.districtEn}`,
      });
    }
  }

  return {
    totalRecords:
      divisions.length + districts.length + upazilas.length + unions.length + postOffices.length,
    byType: {
      divisions: divisions.length,
      districts: districts.length,
      upazilas: upazilas.length,
      unions: unions.length,
      postOffices: postOffices.length,
    },
    errors,
    warnings,
    passed: errors.length === 0,
    version: DATASET_VERSION,
    source: DATASET_SOURCE,
  };
}
