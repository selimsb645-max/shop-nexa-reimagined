// ═══════════════════════════════════════════════════════════════
// Aventa Mart — Logistics Provider Abstraction (Prompt 03 §5)
// ═══════════════════════════════════════════════════════════════
// NO provider (Daraz/DEX/…) is hard-coded. Every courier integrates
// through this interface. Future providers ("Aventa Logistics",
// "Third Party Courier A/B") register into the provider registry
// without touching order or workflow code.
// ═══════════════════════════════════════════════════════════════

import type { TrackingEventType, TrackingVisibility } from "../orderStateMachine";

export type ShipmentStatus =
  | "CREATED"
  | "LABEL_GENERATED"
  | "PICKED_UP"
  | "HANDED_OVER"
  | "IN_TRANSIT"
  | "ARRIVED_AT_HUB"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED"
  | "CANCELLED";

export interface ShipmentRecord {
  /** Secure random id (shp_…) — never predictable (§4). */
  shipmentId: string;
  orderId: string;
  sellerId: string;
  /** Customer uid — enables rules-level "own order only" access (§8). */
  customerId: string;
  trackingNumber: string;
  barcode: string;
  shippingStatus: ShipmentStatus;
  carrier: string;
  /** Provider registry key, e.g. "aventa-logistics". */
  provider: string;
  createdAt: number;
  updatedAt: number;
}

export interface TrackingEventRecord {
  type: TrackingEventType;
  visibility: TrackingVisibility;
  note: string;
  location?: string | null;
  at: number;
  by: string;
}

export interface CreateShipmentInput {
  orderId: string;
  sellerId: string;
  customerId: string;
  carrier?: string;
}

export interface LogisticsProvider {
  /** Registry key — stored on shipment.provider. */
  readonly key: string;
  /** Human-readable carrier label. */
  readonly label: string;
  /** Create the shipment record (§4 structure, §4 secure ids). */
  createShipment(input: CreateShipmentInput): Promise<ShipmentRecord>;
  /** Generate / attach the shipping label for a shipment. */
  generateLabel(shipment: ShipmentRecord): Promise<ShipmentRecord>;
  /** Mark the shipment handed over to the carrier. */
  handoverShipment(shipment: ShipmentRecord): Promise<ShipmentRecord>;
  /** Append a tracking event (§6). */
  trackShipment(
    shipment: ShipmentRecord,
    event: Omit<TrackingEventRecord, "visibility"> & { visibility?: TrackingVisibility },
  ): Promise<TrackingEventRecord>;
  /** Cancel the shipment (only before pickup). */
  cancelShipment(shipment: ShipmentRecord): Promise<ShipmentRecord>;
}

/** Providers must never reject an unknown-shipment call silently —
 *  these errors are surfaced to the workflow processor. */
export class LogisticsError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "LogisticsError";
  }
}
