/**
 * ImageKit upload signature generation — SERVER ONLY.
 *
 * The private API key never leaves the server. Clients request short-lived
 * upload credentials (signature + one-time token + expiry) from
 * `imagekit-auth.functions.ts`, which first verifies the caller's Firebase
 * ID token. This replaces Cloudinary's unsigned-preset flow (the account
 * was permanently banned for policy violation on Sep 15, 2026 — anyone
 * could upload without auth, so the whole cloud got shut down).
 *
 * Signature spec (ImageKit docs):
 *   signature = HMAC_SHA1(privateKey, token + expire) as hex
 * where `token` is a random one-time string and `expire` is a unix-seconds
 * timestamp. Upload requests must send the same token + expire + signature.
 */

import { createHmac, randomBytes } from "node:crypto";

const SIGNATURE_TTL_SECONDS = 240;

/* Runtime-agnostic env reader (same pattern as email.server.ts).
 * Deno.env in test polyfill / Deno deploy; process.env on Node
 * (Nitro/Vercel production). */
function getEnv(name: string): string | undefined {
  if (typeof Deno !== "undefined" && typeof Deno?.env?.get === "function") {
    const v = Deno.env.get(name);
    if (v !== undefined) return v;
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

export interface ImageKitAuthParams {
  signature: string;
  token: string;
  expire: number;
}

export function getImageKitAuthParams(): ImageKitAuthParams {
  const privateKey = getEnv("IMAGEKIT_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("ImageKit is not configured on the server (missing IMAGEKIT_PRIVATE_KEY).");
  }

  const token = randomBytes(16).toString("hex");
  const expire = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
  const signature = createHmac("sha1", privateKey)
    .update(token + expire)
    .digest("hex");

  return { signature, token, expire };
}
