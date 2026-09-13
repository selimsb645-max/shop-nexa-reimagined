/**
 * AVENTA SHOP — Campaign Engine (Prompt 05 §1–§2, §4–§6, §8–§12)
 *
 * Campaigns live in `campaigns/{campaignId}` and follow the validated
 * state machine. TIME IS SERVER-AUTHORITATIVE (§4): every scheduled
 * transition is evaluated against the engine's `now` (epoch ms UTC) —
 * never a client device clock. `advanceCampaigns` is an idempotent
 * sweep the storefront calls lazily; the admin panel can trigger it too.
 *
 * HOMEPAGE SWITCH (§5): activating a campaign snapshots the previous
 * `homeConfig/active` doc into `homeConfig/snap_{campaignId}` and then
 * writes the campaign's home modules. PAUSE/CANCEL/END restores the
 * snapshot (§9 rollback) — previous valid configuration comes back
 * exactly as it was.
 *
 * SECURITY (§12): the public storefront fetches campaigns ONLY through
 * `getActiveCampaignHome()`, which lazily advances campaigns and returns
 * a SANITIZED view (banner, products, countdown endAt) — coupon rules,
 * eligibility internals, admin notes and discount-rule configuration
 * are never exposed to customers.
 */
import {
  docPath,
  batchGetDocs,
  commitWrites,
  runFirestoreQuery,
  toFsFields,
  fromFsFields,
  newDocId,
  type FsWrite,
} from "../firebase-admin.server";
import {
  isValidCampaignTransition,
  assertCampaignTransition,
  allowsSellerSubmissions,
  type CampaignState,
} from "./campaignStateMachine";
import { validateDiscountRules, type DiscountRules } from "./pricing";

export const CAMPAIGNS_COLLECTION = "campaigns";
export const CAMPAIGN_EVENTS_COLLECTION = "campaignEvents";
export const CAMPAIGN_NOTIFICATIONS_COLLECTION = "campaignNotifications";
export const HOME_CONFIG_COLLECTION = "homeConfig";
export const HOME_CONFIG_ACTIVE_DOC = "active";

/** Campaign events that trigger customer/seller notifications (§10). */
export type CampaignNotificationEvent =
  "CAMPAIGN_SCHEDULED" | "CAMPAIGN_STARTED" | "CAMPAIGN_ENDING" | "CAMPAIGN_ENDED";

/** Audit actions (§11) — append-only, never edited or deleted. */
export type CampaignAuditAction =
  | "created"
  | "updated"
  | "submitted"
  | "approved"
  | "rejected"
  | "scheduled"
  | "activated"
  | "paused"
  | "resumed"
  | "cancelled"
  | "ended"
  | "home_switched"
  | "home_restored";

export interface CampaignBanner {
  imageUrl: string | null;
  title: string | null;
  subtitle: string | null;
  link: string | null;
}

export interface CouponRules {
  codes: string[];
  minOrderMinor: number;
  maxUses: number | null;
  perCustomerLimit: number;
}

export interface FlashSaleConfig {
  enabled: boolean;
  stockLimit: number;
  perCustomerLimit: number;
  salePriceMinor: number | null;
}

export interface HomeModules {
  heroBanner: boolean;
  campaignBanner: boolean;
  featuredProducts: boolean;
  flashSaleSection: boolean;
  /** Product ids to feature (resolved server-side at switch time). */
  featuredProductIds: string[];
}

export interface Campaign {
  campaignId: string;
  name: string;
  description: string;
  status: CampaignState;
  /** Epoch ms UTC — server time authority, timezone-independent (§4). */
  startAt: number;
  endAt: number;
  banner: CampaignBanner;
  eligibleCategories: string[];
  eligibleProducts: string[];
  eligibleSellers: string[];
  discountRules: DiscountRules;
  couponRules: CouponRules;
  scope: "global" | "category" | "products";
  /** §8: global/high-value campaigns need super_admin approval. */
  elevatedApprovalRequired: boolean;
  flashSale: FlashSaleConfig;
  homeModules: HomeModules;
  createdBy: string;
  approvedBy: string | null;
  createdAt: number;
  updatedAt: number;
  activatedAt: number | null;
  endedAt: number | null;
  endingNotifiedAt: number | null;
}

export interface CampaignActor {
  uid: string;
  adminRole: string | null;
}

/* ──────────────────────────────────────────────────────────────── */
/* Permissions (§8, §12) — mirrored by Firestore rules               */
/* ──────────────────────────────────────────────────────────────── */

const CAMPAIGN_MANAGER_ROLES = ["super_admin", "admin", "platform_admin", "marketing_admin"];

export function canManageCampaigns(adminRole: string | null | undefined): boolean {
  return adminRole != null && CAMPAIGN_MANAGER_ROLES.includes(adminRole);
}

export function canApproveCampaign(
  campaign: Pick<Campaign, "elevatedApprovalRequired">,
  adminRole: string | null | undefined,
): boolean {
  if (adminRole === "super_admin") return true;
  if (campaign.elevatedApprovalRequired) return false; // elevated → super_admin only
  return canManageCampaigns(adminRole);
}

export async function requireCampaignManager(
  projectId: string,
  actor: CampaignActor,
): Promise<void> {
  // The scheduler sweep itself is a trusted engine actor (§4) — its
  // authority is the clock, not a role; only the internal sweep can
  // produce this actor (client calls never pass adminRole "system").
  if (actor.adminRole === "system") return;
  const docs = await batchGetDocs(projectId, [docPath(projectId, ["users", actor.uid])]);
  const userDoc = docs.get(docPath(projectId, ["users", actor.uid]));
  const role =
    ((userDoc?.data as Record<string, unknown> | undefined)?.["adminRole"] as string | undefined) ??
    actor.adminRole;
  if (!canManageCampaigns(role)) {
    throw new Error(`campaigns/permission: role ${role ?? "none"} cannot manage campaigns`);
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* Creation & mutation (§1)                                          */
/* ──────────────────────────────────────────────────────────────── */

export interface CreateCampaignInput {
  name: string;
  description: string;
  startAt: number;
  endAt: number;
  banner: Partial<CampaignBanner>;
  eligibleCategories: string[];
  eligibleProducts: string[];
  eligibleSellers: string[];
  discountRules: DiscountRules;
  couponRules: Partial<CouponRules>;
  homeModules: Partial<HomeModules>;
  flashSale?: Partial<FlashSaleConfig>;
  createdBy: string;
}

export async function createCampaign(
  projectId: string,
  input: CreateCampaignInput,
): Promise<Campaign> {
  if (!input.name?.trim()) throw new Error("campaigns/validation: name is required");
  if (!Number.isSafeInteger(input.startAt) || !Number.isSafeInteger(input.endAt)) {
    throw new Error("campaigns/validation: startAt/endAt must be epoch ms integers");
  }
  if (input.endAt <= input.startAt) {
    throw new Error("campaigns/validation: endAt must be after startAt");
  }
  const priceCheck = validateDiscountRules(input.discountRules);
  if (!priceCheck.ok) {
    throw new Error(`campaigns/validation: ${priceCheck.errors.join("; ")}`);
  }
  if (input.flashSale?.enabled && (!input.flashSale.stockLimit || input.flashSale.stockLimit < 1)) {
    throw new Error("campaigns/validation: flash sale requires stockLimit >= 1");
  }

  const campaignId = `cmp_${newDocId()}`;
  const now = Date.now();
  const campaign: Campaign = {
    campaignId,
    name: input.name.trim(),
    description: input.description ?? "",
    status: "DRAFT",
    startAt: input.startAt,
    endAt: input.endAt,
    banner: {
      imageUrl: input.banner.imageUrl ?? null,
      title: input.banner.title ?? null,
      subtitle: input.banner.subtitle ?? null,
      link: input.banner.link ?? null,
    },
    eligibleCategories: input.eligibleCategories ?? [],
    eligibleProducts: input.eligibleProducts ?? [],
    eligibleSellers: input.eligibleSellers ?? [],
    discountRules: input.discountRules,
    couponRules: {
      codes: input.couponRules.codes ?? [],
      minOrderMinor: input.couponRules.minOrderMinor ?? 0,
      maxUses: input.couponRules.maxUses ?? null,
      perCustomerLimit: input.couponRules.perCustomerLimit ?? 1,
    },
    scope:
      input.eligibleProducts.length > 0
        ? "products"
        : input.eligibleCategories.length > 0
          ? "category"
          : "global",
    elevatedApprovalRequired: false, // set via markElevated / rules flag on create
    flashSale: {
      enabled: input.flashSale?.enabled ?? false,
      stockLimit: input.flashSale?.stockLimit ?? 0,
      perCustomerLimit: input.flashSale?.perCustomerLimit ?? 1,
      salePriceMinor: input.flashSale?.salePriceMinor ?? null,
    },
    homeModules: {
      heroBanner: input.homeModules.heroBanner ?? true,
      campaignBanner: input.homeModules.campaignBanner ?? true,
      featuredProducts: input.homeModules.featuredProducts ?? false,
      flashSaleSection: input.homeModules.flashSaleSection ?? false,
      featuredProductIds: input.homeModules.featuredProductIds ?? [],
    },
    createdBy: input.createdBy,
    approvedBy: null,
    createdAt: now,
    updatedAt: now,
    activatedAt: null,
    endedAt: null,
    endingNotifiedAt: null,
  };

  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [CAMPAIGNS_COLLECTION, campaignId]),
        fields: toFsFields({ ...campaign } as Record<string, unknown>),
      },
    },
  ]);
  await appendCampaignEvent(
    projectId,
    campaignId,
    "created",
    { uid: input.createdBy, adminRole: null },
    {
      name: campaign.name,
      status: campaign.status,
    },
  );
  return campaign;
}

export async function getCampaign(projectId: string, campaignId: string): Promise<Campaign | null> {
  const docs = await batchGetDocs(projectId, [
    docPath(projectId, [CAMPAIGNS_COLLECTION, campaignId]),
  ]);
  const d = docs.get(docPath(projectId, [CAMPAIGNS_COLLECTION, campaignId]));
  if (!d?.exists) return null;
  return d.data as Record<string, unknown> as unknown as Campaign;
}

/* ──────────────────────────────────────────────────────────────── */
/* Transitions (§2, §8, §9, §11)                                      */
/* ──────────────────────────────────────────────────────────────── */

export async function transitionCampaign(
  projectId: string,
  campaignId: string,
  toState: CampaignState,
  actor: CampaignActor,
  opts?: { reason?: string },
): Promise<Campaign> {
  const campaign = await getCampaign(projectId, campaignId);
  if (!campaign) throw new Error(`campaigns/not-found: ${campaignId}`);
  await requireCampaignManager(projectId, actor);
  assertCampaignTransition(campaign.status, toState);

  // Approval gate (§8): elevated campaigns only super_admin may approve.
  if (toState === "APPROVED" && !canApproveCampaign(campaign, actor.adminRole)) {
    throw new Error(
      `campaigns/permission: campaign ${campaign.name} requires elevated (super_admin) approval`,
    );
  }
  // Scheduling gate (§4): APPROVED → SCHEDULED needs a valid future window.
  if (toState === "SCHEDULED" && campaign.endAt <= Date.now()) {
    throw new Error("campaigns/schedule: endAt is in the past");
  }

  const now = Date.now();
  const patch: Record<string, unknown> = { status: toState, updatedAt: now };
  const auditAction: CampaignAuditAction | null = mapAuditAction(campaign.status, toState);

  if (toState === "APPROVED") patch["approvedBy"] = actor.uid;
  if (toState === "SCHEDULED") {
    await queueCampaignNotification(projectId, campaignId, "CAMPAIGN_SCHEDULED", campaign);
  }
  if (toState === "ACTIVE") {
    patch["activatedAt"] = now;
    await switchHomeConfig(projectId, campaign);
    await queueCampaignNotification(projectId, campaignId, "CAMPAIGN_STARTED", campaign);
  }
  if (toState === "PAUSED") {
    await restoreHomeConfig(projectId, campaignId);
  }
  if (toState === "CANCELLED" && campaign.status === "ACTIVE") {
    await restoreHomeConfig(projectId, campaignId);
  }
  if (toState === "ENDED") {
    patch["endedAt"] = now;
    await restoreHomeConfig(projectId, campaignId);
    await queueCampaignNotification(projectId, campaignId, "CAMPAIGN_ENDED", campaign);
  }

  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [CAMPAIGNS_COLLECTION, campaignId]),
        fields: toFsFields(patch),
      },
    },
  ]);
  if (auditAction) {
    await appendCampaignEvent(projectId, campaignId, auditAction, actor, {
      from: campaign.status,
      to: toState,
      reason: opts?.reason ?? null,
    });
  }
  return { ...campaign, ...patch } as Campaign;
}

function mapAuditAction(from: CampaignState, to: CampaignState): CampaignAuditAction | null {
  if (to === from) return null;
  switch (to) {
    case "SUBMITTED":
      return "submitted";
    case "REVIEW":
      return "updated";
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "SCHEDULED":
      return "scheduled";
    case "ACTIVE":
      return from === "PAUSED" ? "resumed" : "activated";
    case "PAUSED":
      return "paused";
    case "CANCELLED":
      return "cancelled";
    case "ENDED":
      return "ended";
    default:
      return "updated";
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* Time-based automation (§4) — server-authoritative sweep           */
/* ──────────────────────────────────────────────────────────────── */

/** Configurable "ending soon" lead time (ms). Zero disables the notice. */
export const DEFAULT_ENDING_LEAD_MS = 3 * 60 * 60 * 1000; // 3 hours

export interface SweepResult {
  activated: string[];
  ended: string[];
  endingNotified: string[];
}

/**
 * Idempotent, monotonic-safe sweep:
 *   SCHEDULED + now >= startAt  → ACTIVE   (home switch + notifications)
 *   ACTIVE    + now >= endAt    → ENDED    (home restore + notifications)
 *   ACTIVE    + endAt - now <= endingLead && !endingNotifiedAt
 *                                    → CAMPAIGN_ENDING notification
 *
 * `now` is injectable for deterministic tests — in production the
 * engine's server clock is the ONLY authority (§4). Epoch ms is
 * timezone-independent by definition; local wall-clock formats are a
 * display concern only.
 */
export async function advanceCampaigns(
  projectId: string,
  now: number = Date.now(),
  endingLeadMs: number = DEFAULT_ENDING_LEAD_MS,
): Promise<SweepResult> {
  const result: SweepResult = { activated: [], ended: [], endingNotified: [] };

  const queryByStatus = async (status: string): Promise<Campaign[]> => {
    const rows = (await runFirestoreQuery(projectId, {
      from: [{ collectionId: CAMPAIGNS_COLLECTION }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: status },
        },
      },
    })) as Array<{ document?: { fields: Record<string, unknown> } }>;
    return rows
      .filter((row) => row.document)
      .map((row) => fromFsFields(row.document!.fields as never) as unknown as Campaign);
  };
  const [scheduled, active] = await Promise.all([
    queryByStatus("SCHEDULED"),
    queryByStatus("ACTIVE"),
  ]);

  for (const c of [...scheduled, ...active]) {
    if (c.status === "SCHEDULED" && now >= c.startAt) {
      await transitionCampaign(projectId, c.campaignId, "ACTIVE", {
        uid: "system",
        adminRole: "system",
      });
      result.activated.push(c.campaignId);
    } else if (c.status === "ACTIVE") {
      if (now >= c.endAt) {
        await transitionCampaign(projectId, c.campaignId, "ENDED", {
          uid: "system",
          adminRole: "system",
        });
        result.ended.push(c.campaignId);
      } else if (endingLeadMs > 0 && c.endingNotifiedAt == null && c.endAt - now <= endingLeadMs) {
        await queueCampaignNotification(projectId, c.campaignId, "CAMPAIGN_ENDING", c);
        await commitWrites(projectId, [
          {
            update: {
              name: docPath(projectId, [CAMPAIGNS_COLLECTION, c.campaignId]),
              fields: toFsFields({ endingNotifiedAt: now, updatedAt: now }),
            },
          },
        ]);
        result.endingNotified.push(c.campaignId);
      }
    }
  }
  return result;
}

/* ──────────────────────────────────────────────────────────────── */
/* Homepage content switch + rollback (§5, §9)                        */
/* ──────────────────────────────────────────────────────────────── */

export interface ActiveHomeConfig {
  campaignId: string | null;
  campaignName: string | null;
  heroBanner: CampaignBanner | null;
  campaignBanner: CampaignBanner | null;
  flashSaleSection: boolean;
  featuredProductIds: string[];
  switchedAt: number | null;
}

export const EMPTY_HOME_CONFIG: ActiveHomeConfig = {
  campaignId: null,
  campaignName: null,
  heroBanner: null,
  campaignBanner: null,
  flashSaleSection: false,
  featuredProductIds: [],
  switchedAt: null,
};

export async function readActiveHomeConfig(projectId: string): Promise<ActiveHomeConfig> {
  const docs = await batchGetDocs(projectId, [
    docPath(projectId, [HOME_CONFIG_COLLECTION, HOME_CONFIG_ACTIVE_DOC]),
  ]);
  const d = docs.get(docPath(projectId, [HOME_CONFIG_COLLECTION, HOME_CONFIG_ACTIVE_DOC]));
  if (!d?.exists) return { ...EMPTY_HOME_CONFIG };
  return d.data as Record<string, unknown> as unknown as ActiveHomeConfig;
}

/** Activate: snapshot the previous config, then switch (§5 + §9). */
export async function switchHomeConfig(projectId: string, campaign: Campaign): Promise<void> {
  const previous = await readActiveHomeConfig(projectId);
  const writes: FsWrite[] = [];
  // Snapshot previous configuration for rollback (§9) — only if not
  // already snapshotted (idempotent re-activation keeps the ORIGINAL
  // pre-campaign config as the restore point).
  if (previous.campaignId !== campaign.campaignId) {
    writes.push({
      update: {
        name: docPath(projectId, [HOME_CONFIG_COLLECTION, `snap_${campaign.campaignId}`]),
        fields: toFsFields({ ...previous, snapshotOf: campaign.campaignId }),
      },
    });
  }
  const next: ActiveHomeConfig = {
    campaignId: campaign.campaignId,
    campaignName: campaign.name,
    heroBanner: campaign.homeModules.heroBanner ? campaign.banner : null,
    campaignBanner: campaign.homeModules.campaignBanner ? campaign.banner : null,
    flashSaleSection: campaign.homeModules.flashSaleSection && campaign.flashSale.enabled,
    featuredProductIds: campaign.homeModules.featuredProductIds,
    switchedAt: Date.now(),
  };
  writes.push({
    update: {
      name: docPath(projectId, [HOME_CONFIG_COLLECTION, HOME_CONFIG_ACTIVE_DOC]),
      fields: toFsFields({ ...next } as Record<string, unknown>),
    },
  });
  await commitWrites(projectId, writes);
  await appendCampaignEvent(
    projectId,
    campaign.campaignId,
    "home_switched",
    { uid: "system", adminRole: "system" },
    {
      modules: campaign.homeModules,
    },
  );
}

/** Rollback (§9): restore the snapshotted previous configuration. */
export async function restoreHomeConfig(projectId: string, campaignId: string): Promise<void> {
  const docs = await batchGetDocs(projectId, [
    docPath(projectId, [HOME_CONFIG_COLLECTION, `snap_${campaignId}`]),
  ]);
  const snap = docs.get(docPath(projectId, [HOME_CONFIG_COLLECTION, `snap_${campaignId}`]));
  const restore: ActiveHomeConfig = snap?.exists
    ? (() => {
        const raw = snap.data as Record<string, unknown> as Record<string, unknown>;
        return {
          campaignId: (raw["campaignId"] as string | null) ?? null,
          campaignName: (raw["campaignName"] as string | null) ?? null,
          heroBanner: (raw["heroBanner"] as CampaignBanner | null) ?? null,
          campaignBanner: (raw["campaignBanner"] as CampaignBanner | null) ?? null,
          flashSaleSection: Boolean(raw["flashSaleSection"]),
          featuredProductIds: (raw["featuredProductIds"] as string[]) ?? [],
          switchedAt: (raw["switchedAt"] as number | null) ?? null,
        };
      })()
    : { ...EMPTY_HOME_CONFIG };
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [HOME_CONFIG_COLLECTION, HOME_CONFIG_ACTIVE_DOC]),
        fields: toFsFields({ ...restore } as Record<string, unknown>),
      },
    },
  ]);
  await appendCampaignEvent(
    projectId,
    campaignId,
    "home_restored",
    { uid: "system", adminRole: "system" },
    {
      restoredFrom: snap?.exists ? `snap_${campaignId}` : "empty-default",
    },
  );
}

/* ──────────────────────────────────────────────────────────────── */
/* Notifications (§10) — queue records for the existing FCM infra     */
/* ──────────────────────────────────────────────────────────────── */

export async function queueCampaignNotification(
  projectId: string,
  campaignId: string,
  event: CampaignNotificationEvent,
  campaign: Pick<Campaign, "name" | "endAt">,
  audience: "customers" | "sellers" = "customers",
): Promise<void> {
  const now = Date.now();
  const titles: Record<CampaignNotificationEvent, string> = {
    CAMPAIGN_SCHEDULED: `Campaign scheduled: ${campaign.name}`,
    CAMPAIGN_STARTED: `${campaign.name} is LIVE now!`,
    CAMPAIGN_ENDING: `${campaign.name} ends soon!`,
    CAMPAIGN_ENDED: `${campaign.name} has ended`,
  };
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [CAMPAIGN_NOTIFICATIONS_COLLECTION, `ntf_${newDocId()}`]),
        fields: toFsFields({
          campaignId,
          event,
          audience,
          title: titles[event],
          body: campaign.name,
          endAt: campaign.endAt,
          // consumed by the existing FCM/notifications infrastructure
          delivered: false,
          createdAt: now,
        }),
      },
    },
  ]);
}

/* ──────────────────────────────────────────────────────────────── */
/* Audit trail (§11) — append-only                                   */
/* ──────────────────────────────────────────────────────────────── */

export interface CampaignAuditEvent {
  eventId: string;
  campaignId: string;
  actorUid: string;
  actorRole: string | null;
  action: CampaignAuditAction;
  detail: Record<string, unknown> | null;
  createdAt: number;
}

export async function appendCampaignEvent(
  projectId: string,
  campaignId: string,
  action: CampaignAuditAction,
  actor: CampaignActor,
  detail: Record<string, unknown> | null,
): Promise<void> {
  const eventId = `cev_${newDocId()}`;
  const now = Date.now();
  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, [CAMPAIGN_EVENTS_COLLECTION, eventId]),
        fields: toFsFields({
          eventId,
          campaignId,
          actorUid: actor.uid,
          actorRole: actor.adminRole,
          action,
          detail,
          createdAt: now,
        }),
      },
    },
  ]);
}

export async function listCampaignEvents(
  projectId: string,
  campaignId: string,
  limit = 100,
): Promise<CampaignAuditEvent[]> {
  const rows = (await runFirestoreQuery(projectId, {
    from: [{ collectionId: CAMPAIGN_EVENTS_COLLECTION }],
    where: {
      fieldFilter: {
        field: { fieldPath: "campaignId" },
        op: "EQUAL",
        value: { stringValue: campaignId },
      },
    },
    limit,
  })) as Array<{ document?: { fields: Record<string, unknown> } }>;
  return rows
    .filter((row) => row.document)
    .map((row) => fromFsFields(row.document!.fields as never) as unknown as CampaignAuditEvent)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/* ──────────────────────────────────────────────────────────────── */
/* Public storefront view (§5, §12) — sanitized, server-side only     */
/* ──────────────────────────────────────────────────────────────── */

export interface PublicCampaignHome {
  campaign: {
    campaignId: string;
    name: string;
    description: string;
    banner: CampaignBanner;
    /** countdown anchor — server time, not device clock (§4, §12) */
    endsAt: number;
  } | null;
  home: ActiveHomeConfig;
}

/**
 * The ONLY storefront entry point for campaign data. Lazily advances
 * campaigns (server clock), then returns a sanitized view: couponRules,
 * discount configuration, eligibleSellers and admin internals are
 * stripped (§12 — internal campaign configuration never exposed).
 */
export async function getActiveCampaignHome(projectId: string): Promise<PublicCampaignHome> {
  // Kernel heartbeat (Prompt 06 follow-up): the storefront visit
  // drains pending domain-event dispatches (bounded, idempotent) and
  // registers the campaign listing subscriber before doing so.
  try {
    const { ensureCampaignListingSubscriber } = await import("./listingRegistry.server");
    const { processDueDispatches } = await import("../kernel/events");
    ensureCampaignListingSubscriber();
    await processDueDispatches(projectId, { limit: 25 });
  } catch {
    // The backbone must never take the homepage down.
  }
  await advanceCampaigns(projectId);
  const home = await readActiveHomeConfig(projectId);
  if (!home.campaignId) {
    return { campaign: null, home };
  }
  const campaign = await getCampaign(projectId, home.campaignId);
  if (!campaign || campaign.status !== "ACTIVE") {
    return { campaign: null, home };
  }
  return {
    campaign: {
      campaignId: campaign.campaignId,
      name: campaign.name,
      description: campaign.description,
      banner: campaign.banner,
      endsAt: campaign.endAt,
    },
    home,
  };
}
