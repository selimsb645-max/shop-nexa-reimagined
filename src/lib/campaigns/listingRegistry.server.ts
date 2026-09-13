/**
 * Campaign × Kernel bridge (Prompt 06 follow-up)
 *
 * The backbone arrow: PRODUCT → (QC) → CAMPAIGN.
 *
 * The campaign engine subscribes to the kernel event bus. When a
 * product passes QC and gets LISTED, it automatically becomes
 * campaign-eligible — the marketing team can immediately pick it for
 * campaigns and flash sales WITHOUT re-entering product data. When a
 * product is UNLISTED (takedown), it drops out of the catalog so no
 * campaign ever promotes a dead product.
 *
 * The subscriber also queues a seller notification through the
 * existing campaign notification infrastructure (§10 of Prompt 05),
 * so sellers learn their product went live and is promo-eligible.
 *
 * Fully decoupled: QC knows nothing about campaigns; this module only
 * reacts to typed kernel events (product.listed / product.unlisted).
 */

import { docPath, toFsFields, commitWrites, getProjectId } from "../firebase-admin.server";
import { registerSubscriber, type Subscriber } from "../kernel/events";
import { CAMPAIGN_NOTIFICATIONS_COLLECTION } from "./campaigns.server";
import { newDocId } from "../firebase-admin.server";

export const CAMPAIGN_PRODUCT_CATALOG_COLLECTION = "campaignProductCatalog";

interface ListedPayload {
  productId: string;
  sellerUid: string;
}

const listingSubscriber: Subscriber = {
  name: "campaign-listing-registry",
  types: ["product.listed", "product.unlisted"],
  handler: async (event) => {
    const projectId = getProjectId();
    const payload = event.payload as Partial<ListedPayload>;
    const productId = String(payload.productId ?? "");
    if (!productId) throw new Error("campaign/listing: missing productId");

    if (event.type === "product.listed") {
      const now = Date.now();
      const catalogDoc = docPath(projectId, [CAMPAIGN_PRODUCT_CATALOG_COLLECTION, productId]);
      const sellerNtf = docPath(projectId, [
        CAMPAIGN_NOTIFICATIONS_COLLECTION,
        `ntf_${newDocId()}`,
      ]);
      await commitWrites(projectId, [
        {
          update: {
            name: catalogDoc,
            fields: toFsFields({
              productId,
              sellerUid: String(payload.sellerUid ?? ""),
              eligible: true,
              listedAt: now,
              updatedAt: now,
            }),
          },
        },
        {
          update: {
            name: sellerNtf,
            fields: toFsFields({
              campaignId: null,
              event: "PRODUCT_LISTED",
              audience: "sellers",
              title: "Your product is LIVE on AVENTA SHOP",
              body: `Product ${productId} passed QC and is now listed — it is eligible for campaigns and flash sales.`,
              delivered: false,
              createdAt: now,
            }),
          },
        },
      ]);
      return;
    }

    // product.unlisted → drop out of the promo catalog (keep the doc
    // as a tombstone with eligible:false so history remains queryable)
    const now = Date.now();
    await commitWrites(projectId, [
      {
        update: {
          name: docPath(projectId, [CAMPAIGN_PRODUCT_CATALOG_COLLECTION, productId]),
          fields: toFsFields({
            productId,
            eligible: false,
            unlistedAt: now,
            updatedAt: now,
          }),
        },
      },
    ]);
  },
};

/**
 * Idempotent registration — call from any server entrypoint that
 * processes kernel dispatches (campaign sweep, admin functions).
 */
let registered = false;
export function ensureCampaignListingSubscriber(): void {
  if (registered) return;
  registerSubscriber(listingSubscriber);
  registered = true;
}
