import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const authSchema = z.object({
  idToken: z.string().min(10),
});

/**
 * Returns short-lived ImageKit upload credentials (signature, one-time
 * token, expiry) for SIGNED client-side uploads. The private key stays on
 * the server; only the caller-verified Firebase ID token comes from the
 * client. Anyone not signed in cannot obtain upload credentials.
 */
export const getImageKitAuthFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => authSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { getImageKitAuthParams } = await import("./imagekit-auth.server");

    await verifyIdToken(data.idToken);

    return getImageKitAuthParams();
  });
