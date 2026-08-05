import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const redeemSchema = z.object({
  idToken: z.string().min(10),
  points: z.number().int().min(1).max(1_000_000),
});

const referralSchema = z.object({
  idToken: z.string().min(10),
  code: z.string().trim().min(3).max(64),
  displayName: z.string().max(120).nullable(),
  referrerId: z.string().min(1).max(200),
});

/** Redeems reward points into wallet credit, verified and written server side. */
export const redeemRewardPoints = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => redeemSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { redeemPointsServer } = await import("./wallet.server");
    const { uid } = await verifyIdToken(data.idToken);
    return redeemPointsServer(uid, data.points);
  });

/** Applies a referral code and credits the welcome bonus, verified server side. */
export const claimReferralBonus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => referralSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { applyReferralServer } = await import("./wallet.server");
    const { uid } = await verifyIdToken(data.idToken);
    if (data.referrerId === uid) throw new Error("You cannot use your own code");
    return applyReferralServer({
      uid,
      displayName: data.displayName,
      code: data.code,
      referrerId: data.referrerId,
    });
  });
