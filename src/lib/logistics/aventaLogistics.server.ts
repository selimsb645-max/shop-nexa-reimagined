// ═══════════════════════════════════════════════════════════════
// Aventa Logistics — Default Internal Provider (Prompt 03 §4-§6)
// ═══════════════════════════════════════════════════════════════
// Firestore-backed shipment records + tracking events, written
// with the service account (server-only — Firestore rules deny
// ALL client writes to shipments/trackingEvents, §8).
//
// All writes are IDEMPOTENT via deterministic ids, so duplicated
// workflow events never produce duplicate shipments or events (§7).
// ═══════════════════════════════════════════════════════════════

import { commitWrites, docPath, toFsFields, type FsWrite } from "../firebase-admin.server";
import {
  TRACKING_EVENT_VISIBILITY,
  type TrackingVisibility,
} from "../orderStateMachine";
import type {
  CreateShipmentInput,
  LogisticsProvider,
  ShipmentRecord,
  ShipmentStatus,
  TrackingEventRecord,
} from "./types";
import { LogisticsError } from "./types";
import {
  secureBarcode,
  secureShipmentId,
  secureTrackingNumber,
} from "./secureIds";

export const SHIPMENTS_COLLECTION = "shipments";
export const TRACKING_EVENTS_COLLECTION = "events";

/** Deterministic shipment doc id per order — idempotent create (§7). */
export function shipmentDocId(orderId: string): string {
  return `shm_${orderId}`;
}

function fromFs(fields: Record<string, unknown>): ShipmentRecord {
  return {
    shipmentId: String(fields["shipmentId"] ?? ""),
    orderId: String(fields["orderId"] ?? ""),
    sellerId: String(fields["sellerId"] ?? ""),
    customerId: String(fields["customerId"] ?? ""),
    trackingNumber: String(fields["trackingNumber"] ?? ""),
    barcode: String(fields["barcode"] ?? ""),
    shippingStatus: String(fields["shippingStatus"] ?? "CREATED") as ShipmentStatus,
    carrier: String(fields["carrier"] ?? "Aventa Logistics"),
    provider: String(fields["provider"] ?? "aventa-logistics"),
    createdAt: Number(fields["createdAt"] ?? 0),
    updatedAt: Number(fields["updatedAt"] ?? 0),
  };
}

/**
 * Aventa's own logistics provider — manages shipments internally
 * in Firestore. Constructed with the Firebase project id; all
 * writes go through the service account (REST + Admin auth).
 */
export class AventaLogisticsProvider implements LogisticsProvider {
  readonly key = "aventa-logistics";
  readonly label = "Aventa Logistics";

  constructor(private readonly projectId: string) {}

  async createShipment(input: CreateShipmentInput): Promise<ShipmentRecord> {
    const now = Date.now();
    // Secure, unpredictable identifiers (§4 — never sequential).
    const shipment: ShipmentRecord = {
      shipmentId: secureShipmentId(),
      orderId: input.orderId,
      sellerId: input.sellerId,
      customerId: input.customerId,
      trackingNumber: secureTrackingNumber(),
      barcode: secureBarcode(),
      shippingStatus: "CREATED",
      carrier: input.carrier ?? this.label,
      provider: this.key,
      createdAt: now,
      updatedAt: now,
    };
    await this.writeShipment(shipment);
    return shipment;
  }

  async generateLabel(shipment: ShipmentRecord): Promise<ShipmentRecord> {
    if (shipment.shippingStatus !== "CREATED") return shipment; // idempotent
    const updated: ShipmentRecord = {
      ...shipment,
      shippingStatus: "LABEL_GENERATED",
      updatedAt: Date.now(),
    };
    await this.writeShipment(updated);
    return updated;
  }

  async handoverShipment(shipment: ShipmentRecord): Promise<ShipmentRecord> {
    const advanced: ShipmentStatus[] = ["PICKED_UP", "HANDED_OVER", "IN_TRANSIT"];
    if (advanced.includes(shipment.shippingStatus)) return shipment; // idempotent
    const updated: ShipmentRecord = {
      ...shipment,
      shippingStatus: "HANDED_OVER",
      updatedAt: Date.now(),
    };
    await this.writeShipment(updated);
    return updated;
  }

  async trackShipment(
    shipment: ShipmentRecord,
    event: Omit<TrackingEventRecord, "visibility"> & { visibility?: TrackingVisibility },
  ): Promise<TrackingEventRecord> {
    // §6: internal logistics info is NOT exposed to customers.
    const visibility: TrackingVisibility =
      event.visibility ?? TRACKING_EVENT_VISIBILITY[event.type];
    const seq = Date.now();
    const id = `evt_${event.type.toLowerCase()}_${seq}`;
    const write: FsWrite = {
      update: {
        name: docPath(this.projectId, [
          SHIPMENTS_COLLECTION,
          shipmentDocId(shipment.orderId),
          TRACKING_EVENTS_COLLECTION,
          id,
        ]),
        fields: toFsFields({ ...event, visibility }),
      },
    };
    await commitWrites(this.projectId, [write]);
    return { ...event, visibility };
  }

  async cancelShipment(shipment: ShipmentRecord): Promise<ShipmentRecord> {
    const notCancellable: ShipmentStatus[] = ["PICKED_UP", "DELIVERED", "RETURNED"];
    if (notCancellable.includes(shipment.shippingStatus)) {
      throw new LogisticsError(
        `Shipment ${shipment.shipmentId} is already ${shipment.shippingStatus} and cannot be cancelled.`,
        "SHIPMENT_NOT_CANCELLABLE",
      );
    }
    if (shipment.shippingStatus === "CANCELLED") return shipment; // idempotent
    const updated: ShipmentRecord = {
      ...shipment,
      shippingStatus: "CANCELLED",
      updatedAt: Date.now(),
    };
    await this.writeShipment(updated);
    return updated;
  }

  private async writeShipment(shipment: ShipmentRecord): Promise<void> {
    const write: FsWrite = {
      update: {
        name: docPath(this.projectId, [
          SHIPMENTS_COLLECTION,
          shipmentDocId(shipment.orderId),
        ]),
        fields: toFsFields({ ...shipment }),
      },
    };
    await commitWrites(this.projectId, [write]);
  }
}

export { fromFs as shipmentFromFs };
