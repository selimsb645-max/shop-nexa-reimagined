/**
 * AVENTA SHOP — Admin Commission Rate Management
 *
 * Server-side function for admins to update a seller's commission rate.
 *
 * SECURITY:
 * - Only admins can call this (verified via Firebase ID token in the
 *   server function wrapper in settlement.functions.ts)
 * - Rate is validated and clamped to [0, 1]
 * - Existing settlements are NOT affected (rate is frozen at order creation)
 * - New orders after the change will use the updated rate
 *
 * FLOW:
 * Admin updates commissionRate → stored in sellers/{uid} →
 * checkout reads rate from Firestore → computeSellerSettlement →
 * rate frozen in settlement record → release uses stored value
 */

import { getAccessToken, getProjectId, fromFsFields, toFsFields } from "./firebase-admin.server";

function fsBaseUrl(projectId: string): string {
  const emulatorHost = Deno.env.get("FIRESTORE_EMULATOR_HOST");
  if (emulatorHost) {
    return `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`;
  }
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

/**
 * Updates a seller's commission rate.
 * Only callable by admins (verification done in the server function wrapper).
 *
 * @param sellerId - The seller's UID
 * @param newRate - New commission rate (0 to 1, e.g. 0.15 = 15%)
 * @returns The clamped rate that was stored
 */
export async function updateSellerCommissionRate(
  sellerId: string,
  newRate: number,
): Promise<{ storedRate: number }> {
  // Validate and clamp the rate
  const rate = Number.isFinite(newRate) ? Math.min(Math.max(newRate, 0), 1) : 0.08; // Default to 8% for invalid input

  const projectId = getProjectId();
  const token = await getAccessToken();

  const body: Record<string, unknown> = {
    fields: toFsFields({
      commissionRate: rate,
      updatedAt: Date.now(),
    }),
  };

  const res = await fetch(`${fsBaseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}?`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update commission rate (${res.status}): ${text}`);
  }

  return { storedRate: rate };
}

/**
 * Reads a seller's current commission rate from Firestore.
 */
export async function readSellerCommissionRate(sellerId: string): Promise<number> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  const res = await fetch(`${fsBaseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Seller not found");

  const doc = await res.json();
  const data = fromFsFields(doc.fields ?? {});
  const rawRate = Number(data.commissionRate ?? 0.08);
  return Number.isFinite(rawRate) ? Math.min(Math.max(rawRate, 0), 1) : 0.08;
}
