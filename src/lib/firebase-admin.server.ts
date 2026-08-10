/**
 * Trusted server-side Firebase access.
 *
 * Runs only inside server function handlers. Uses a Google service account to
 * talk to the Firestore REST API (which bypasses security rules), so order
 * totals, stock and coupon usage are computed from authoritative data instead
 * of trusting whatever the browser sends.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function readServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) {
    throw new Error(
      "Checkout is not configured on the server (missing FIREBASE_SERVICE_ACCOUNT).",
    );
  }
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing required fields.");
  }
  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

export function getProjectId(): string {
  return readServiceAccount().project_id;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** OAuth2 access token for the Firestore REST API (cached until near expiry). */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const sa = readServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    enc.encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error("Could not authenticate with the order service.");
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.token;
}

/**
 * Verify a Firebase ID token and return the caller's uid.
 * Uses Google's Identity Toolkit, which rejects expired/forged/revoked tokens.
 */
export async function verifyIdToken(
  idToken: string,
): Promise<{ uid: string; email: string | null }> {
  const apiKey = Deno.env.get("VITE_FIREBASE_API_KEY") ?? Deno.env.get("FIREBASE_API_KEY");
  if (!apiKey) throw new Error("Server auth verification is not configured.");
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) throw new Error("Your session has expired. Please sign in again.");
  const json = (await res.json()) as {
    users?: Array<{ localId?: string; email?: string; disabled?: boolean }>;
  };
  const user = json.users?.[0];
  if (!user?.localId || user.disabled) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  return { uid: user.localId, email: user.email ?? null };
}

/* ------------------------------------------------------------------ */
/* Firestore REST value encoding                                      */
/* ------------------------------------------------------------------ */

export type FsValue = Record<string, unknown>;

export function toFsValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFsValue) } };
  }
  if (typeof v === "object") {
    return { mapValue: { fields: toFsFields(v as Record<string, unknown>) } };
  }
  return { nullValue: null };
}

export function toFsFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, val] of Object.entries(obj)) out[k] = toFsValue(val);
  return out;
}

export function fromFsValue(v: FsValue | undefined): unknown {
  if (!v) return undefined;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue as boolean;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue as string;
  if ("timestampValue" in v) return new Date(v.timestampValue as string).getTime();
  if ("arrayValue" in v) {
    const av = v.arrayValue as { values?: FsValue[] };
    return (av.values ?? []).map(fromFsValue);
  }
  if ("mapValue" in v) {
    const mv = v.mapValue as { fields?: Record<string, FsValue> };
    return fromFsFields(mv.fields ?? {});
  }
  return undefined;
}

export function fromFsFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFsValue(v);
  return out;
}

/* ------------------------------------------------------------------ */
/* Firestore REST operations                                          */
/* ------------------------------------------------------------------ */

function baseUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

export function docPath(projectId: string, segments: string[]): string {
  return `projects/${projectId}/databases/(default)/documents/${segments.join("/")}`;
}

export interface FetchedDoc {
  exists: boolean;
  data: Record<string, unknown>;
  updateTime: string | null;
}

/** Read documents by full resource name. */
export async function batchGetDocs(
  projectId: string,
  names: string[],
): Promise<Map<string, FetchedDoc>> {
  const result = new Map<string, FetchedDoc>();
  if (!names.length) return result;
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl(projectId)}:batchGet`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ documents: Array.from(new Set(names)) }),
  });
  if (!res.ok) throw new Error("Could not read product data. Please try again.");
  const json = (await res.json()) as Array<{
    found?: { name: string; fields?: Record<string, FsValue>; updateTime?: string };
    missing?: string;
  }>;
  for (const entry of json) {
    if (entry.found) {
      result.set(entry.found.name, {
        exists: true,
        data: fromFsFields(entry.found.fields ?? {}),
        updateTime: entry.found.updateTime ?? null,
      });
    } else if (entry.missing) {
      result.set(entry.missing, { exists: false, data: {}, updateTime: null });
    }
  }
  return result;
}

export type FsWrite = Record<string, unknown>;

/** Atomically apply a set of writes. */
export async function commitWrites(
  projectId: string,
  writes: FsWrite[],
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl(projectId)}:commit`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 409 || text.includes("FAILED_PRECONDITION")) {
      throw new Error(
        "Some items in your cart changed while you were checking out. Please review your cart and try again.",
      );
    }
    throw new Error("We could not place your order. Please try again.");
  }
}

/** Firestore-style 20 character auto id. */
export function newDocId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}
