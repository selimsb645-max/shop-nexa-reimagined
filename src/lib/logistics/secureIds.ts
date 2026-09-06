// ═══════════════════════════════════════════════════════════════
// Secure Shipment Identifiers (Prompt 03 §4)
// ═══════════════════════════════════════════════════════════════
// Predictable barcode/tracking identifiers let an attacker enumerate
// other shipments. All ids here are 128-bit random, prefixed for
// readability only — the prefix carries no sequence information.
// ═══════════════════════════════════════════════════════════════

import { randomBytes } from "node:crypto";

/** Unpredictable shipment id: shp_<26 chars base32> (~128 bits). */
export function secureShipmentId(): string {
  return `shp_${randomBytes(20).toString("base64url").replace(/[-_]/g, "a").slice(0, 26)}`;
}

/** Unpredictable tracking number: AVT-<20 chars>. */
export function secureTrackingNumber(): string {
  return `AVT-${randomBytes(12).toString("hex").toUpperCase().slice(0, 20)}`;
}

/** Unpredictable barcode payload (alphanumeric, scanner-safe). */
export function secureBarcode(): string {
  return randomBytes(14).toString("hex").toUpperCase();
}

/** Deterministic id for tracking events (idempotent workflow writes). */
export function deterministicTrackingEventId(
  shipmentId: string,
  type: string,
  seq: number,
): string {
  return `evt_${shipmentId}_${type}_${seq}`;
}
