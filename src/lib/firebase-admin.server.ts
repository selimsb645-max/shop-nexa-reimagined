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
    throw new Error("Checkout is not configured on the server (missing FIREBASE_SERVICE_ACCOUNT).");
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
  // In emulator mode, use a test project ID
  const testProject = Deno.env.get("FIRESTORE_TEST_PROJECT");
  if (testProject) return testProject;
  if (Deno.env.get("FIRESTORE_EMULATOR_HOST")) {
    throw new Error(
      "Dev emulator mode is missing FIRESTORE_TEST_PROJECT — set it to the emulated project id.",
    );
  }
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
  // In emulator mode, auth is disabled — Firestore REST accepts the documented
  // `owner` pseudo-token for emulator requests.
  if (Deno.env.get("FIRESTORE_EMULATOR_HOST")) {
    return "owner";
  }
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
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claims}`));
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

/** Decode the payload of an emulator-signed Firebase ID token.
 * Returns null for anything that is not a three-part JWT. */
function decodeEmulatorJwt(token: string): { uid: string; email: string | null } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    const payload = JSON.parse(atob(b64)) as {
      sub?: string;
      user_id?: string;
      email?: string;
    };
    const uid = payload.sub ?? payload.user_id;
    if (!uid) return null;
    return { uid, email: payload.email ?? null };
  } catch {
    return null;
  }
}

export async function verifyIdToken(
  idToken: string,
): Promise<{ uid: string; email: string | null }> {
  // In emulator/test mode, accept emulator-signed JWTs (what the real
  // browser client sends via getIdToken) and legacy base64 JSON test tokens.
  // NEVER active in production: gated on FIRESTORE_EMULATOR_HOST.
  if (Deno.env.get("FIRESTORE_EMULATOR_HOST")) {
    const fromJwt = decodeEmulatorJwt(idToken);
    if (fromJwt) return fromJwt;
    try {
      const decoded = JSON.parse(atob(idToken));
      return { uid: decoded.uid, email: decoded.email ?? null };
    } catch {
      throw new Error("Invalid test token.");
    }
  }
  // This is the Firebase Web API key — a PUBLIC identifier, not a secret
  // (see the same value already shipped in src/services/firebase/config.ts,
  // sent to every browser). The env var lets ops override/rotate it without
  // a code change, but the server must not fail closed just because nobody
  // set that var: fall back to the known-public key so token verification
  // (and everything that depends on it — wallet, orders, chat, etc.) works
  // out of the box, exactly like the ImageKit public-key fix.
  const apiKey =
    Deno.env.get("VITE_FIREBASE_API_KEY") ??
    Deno.env.get("FIREBASE_API_KEY") ??
    "AIzaSyCjPujDgUn2c1aLKWLMXTsV3rNM3Q2J1wQ";
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

/**
 * runQuery endpoint (emulator-aware). Structured queries against any
 * top-level collection. Server-only.
 */
export async function runFirestoreQuery(
  projectId: string,
  structuredQuery: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  const token = await getAccessToken();
  const url = `${baseUrl(projectId).replace(/\/documents$/, "")}/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`runQuery failed (${res.status})`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

function baseUrl(projectId: string): string {
  const emulatorHost = Deno.env.get("FIRESTORE_EMULATOR_HOST");
  if (emulatorHost) {
    return `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`;
  }
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
export async function commitWrites(projectId: string, writes: FsWrite[]): Promise<void> {
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

/* ------------------------------------------------------------------ */
/* Firestore REST transactions (optimistic concurrency)                */
/* ------------------------------------------------------------------ */

/**
 * Begin a read-write Firestore transaction.
 * Returns the transaction ID needed for subsequent reads and commits.
 */
export async function beginTransaction(projectId: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl(projectId)}:beginTransaction`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  if (!res.ok) throw new Error("Could not start a secure transaction. Please try again.");
  const json = (await res.json()) as { transaction?: string };
  if (!json.transaction) throw new Error("Could not start a secure transaction. Please try again.");
  return json.transaction;
}

/**
 * Read documents by full resource name *within* an active transaction.
 * These reads create optimistic locks — if any read document is modified
 * by another transaction before this one commits, the commit will fail
 * with ABORTED and the caller should retry.
 */
export async function batchGetDocsWithTx(
  projectId: string,
  names: string[],
  transaction: string,
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
    body: JSON.stringify({ documents: Array.from(new Set(names)), transaction }),
  });
  if (!res.ok) throw new Error("Could not read data within the transaction. Please try again.");
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

/**
 * Commit writes *within* an active transaction.
 * If any document read within this transaction has been modified by another
 * transaction since this one started, the commit fails with an ABORTED error.
 */
export async function commitWithTx(
  projectId: string,
  writes: FsWrite[],
  transaction: string,
): Promise<boolean> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl(projectId)}:commit`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ writes, transaction }),
  });
  if (!res.ok) {
    const text = await res.text();
    // ABORTED = another transaction modified a document we read.
    // Return false so the caller can retry the whole transaction.
    if (res.status === 409 || text.includes("ABORTED") || text.includes("FAILED_PRECONDITION")) {
      return false;
    }
    throw new Error("We could not complete your purchase. Please try again.");
  }
  return true;
}

/** Rollback a transaction (release locks without committing). */
export async function rollbackTransaction(projectId: string, transaction: string): Promise<void> {
  try {
    const token = await getAccessToken();
    await fetch(`${baseUrl(projectId)}:rollback`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ transaction }),
    });
  } catch {
    // Best-effort — transaction will expire on its own
  }
}

/**
 * Run a function inside a Firestore transaction with automatic retry.
 *
 * The callback receives a `read` function (for reading documents within the
 * transaction) and must return the list of writes to commit. If the commit
 * fails because a concurrent transaction modified a read document, the
 * entire function (begin → read → callback → commit) is retried.
 *
 * This provides true serializable isolation for the read document set.
 *
 * @param projectId - Firestore project ID
 * @param fn - callback that receives read function, returns writes array
 * @param maxRetries - max retries on ABORTED (default 5)
 */
export async function runFirestoreTransaction(
  projectId: string,
  fn: (read: (names: string[]) => Promise<Map<string, FetchedDoc>>) => Promise<FsWrite[]>,
  maxRetries = 5,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const tx = await beginTransaction(projectId);
    try {
      const read = (names: string[]) => batchGetDocsWithTx(projectId, names, tx);
      const writes = await fn(read);

      // If the callback returns no writes, it means the transaction should
      // be aborted (e.g., insufficient balance). Rollback and return.
      if (writes.length === 0) {
        await rollbackTransaction(projectId, tx);
        return;
      }

      const committed = await commitWithTx(projectId, writes, tx);
      if (committed) return; // Success!

      // Commit was ABORTED — a concurrent transaction modified our reads.
      // Retry from scratch.
      lastError = new Error("Transaction conflict, retrying...");
    } catch (err) {
      await rollbackTransaction(projectId, tx);
      throw err; // Non-retryable error
    }
  }

  throw lastError ?? new Error("Transaction failed after multiple retries. Please try again.");
}
