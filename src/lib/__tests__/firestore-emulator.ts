/**
 * Lightweight Firestore REST API-compatible server for integration testing.
 *
 * This implements just enough of the Firestore REST API to support
 * the verification and order operations used in AVENTA SHOP:
 * - Document GET (read)
 * - Document PATCH (create/update, with optional preconditions)
 * - Document DELETE
 * - Collection list/runQuery
 * - BatchGet
 * - Commit (batch writes with preconditions)
 *
 * This is NOT a full Firestore implementation — it's a minimal test
 * harness that speaks the same REST protocol so the actual server-side
 * code paths are exercised without modification.
 *
 * The server stores documents in-memory keyed by full resource path.
 * Precondition checking supports:
 * - exists: true/false (for create-if-not-exists / update-if-exists)
 * - fieldFilter equality checks (for atomic conditional updates)
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

interface StoredDoc {
  name: string;
  fields: Record<string, unknown>;
  createTime: string;
  updateTime: string;
}

/** In-memory document store: path → fields */
const store = new Map<string, StoredDoc>();

/** Encode a JS value into Firestore REST API format */
function encodeValue(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(encodeValue) } };
  }
  if (typeof v === "object") {
    return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  }
  return { nullValue: null };
}

function encodeFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = encodeValue(v);
  return out;
}

/** Decode a Firestore REST API value into a JS value */
function decodeValue(v: Record<string, unknown>): unknown {
  if (!v) return undefined;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("arrayValue" in v) {
    const arr = v.arrayValue as { values?: Record<string, unknown>[] };
    return (arr.values ?? []).map(decodeValue);
  }
  if ("mapValue" in v) {
    const mv = v.mapValue as { fields?: Record<string, unknown> };
    return decodeFields(mv.fields ?? {});
  }
  return undefined;
}

function decodeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v as Record<string, unknown>);
  return out;
}

/** Get the full document path from a URL */
function getDocPath(baseUrl: string, url: string): string {
  // URL format: /v1/projects/{project}/databases/(default)/documents/{path}
  const match = url.match(/\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/(.+?)(\?|$)/);
  return match ? match[1] : "";
}

/** Extract collection path and parent from a subcollection path like users/uid/verificationSessions */
function parseCollectionPath(path: string): { collectionId: string; parentPath: string | null } {
  const parts = path.split("/");
  // Even number of parts = collection at root level
  // Odd number = subcollection under a document
  // Last part is the collection ID
  const collectionId = parts[parts.length - 1];
  // If there's a parent document, it's everything before the last part
  if (parts.length > 1) {
    return { collectionId, parentPath: parts.slice(0, -1).join("/") };
  }
  return { collectionId, parentPath: null };
}

/** Query documents in a subcollection matching a prefix */
function queryCollection(parentPath: string, collectionId: string): StoredDoc[] {
  const prefix = parentPath ? `${parentPath}/` : "";
  const results: StoredDoc[] = [];
  for (const [path, doc] of store.entries()) {
    if (path.startsWith(prefix + collectionId + "/")) {
      results.push(doc);
    }
  }
  return results;
}

/** Apply a Firestore structured query filter to a document */

/**
 * Set a nested field value using a dotted path (e.g., "settlement.status").
 * Mutates the target object in place.
 */
function setNestedField(
  target: Record<string, unknown>,
  dottedPath: string,
  encodedValue: Record<string, unknown>,
): void {
  const parts = dottedPath.split(".");
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = { mapValue: { fields: {} } };
    }
    const mv = current[key] as { mapValue: { fields: Record<string, unknown> } };
    if (!mv.mapValue || !mv.mapValue.fields) {
      mv.mapValue = { fields: {} };
    }
    current = mv.mapValue.fields;
  }
  current[parts[parts.length - 1]] = encodedValue;
}

/**
 * Get a nested field value using a dotted path from Firestore-encoded fields.
 */
function getNestedField(fields: Record<string, unknown>, dottedPath: string): unknown {
  const parts = dottedPath.split(".");
  let current: unknown = fields;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    const curr = current as Record<string, unknown>;
    if (part in curr) {
      current = curr[part];
    } else {
      // Try nested mapValue
      const mv = curr[part] as { mapValue?: { fields?: Record<string, unknown> } } | undefined;
      if (mv?.mapValue?.fields) {
        current = mv.mapValue.fields;
      } else {
        return undefined;
      }
    }
  }
  return current;
}

function matchesFilter(
  docFields: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  if ("compositeFilter" in filter) {
    const cf = filter.compositeFilter as { op: string; filters: Record<string, unknown>[] };
    const results = cf.filters.map((f) => matchesFilter(docFields, f));
    return cf.op === "AND" ? results.every(Boolean) : results.some(Boolean);
  }
  if ("fieldFilter" in filter) {
    const ff = filter.fieldFilter as {
      field: { fieldPath: string };
      op: string;
      value: Record<string, unknown>;
    };
    // docFields are in Firestore encoded format — decode first
    // Support nested field paths (e.g., "settlement.settlementStatus")
    const fieldPath = ff.field.fieldPath;
    let fieldRaw: unknown;
    if (fieldPath.includes(".")) {
      fieldRaw = getNestedField(docFields, fieldPath);
    } else {
      fieldRaw = docFields[fieldPath];
    }
    const fieldValue = fieldRaw ? decodeValue(fieldRaw as Record<string, unknown>) : undefined;
    const filterValue = decodeValue(ff.value);
    switch (ff.op) {
      case "EQUAL":
        return fieldValue === filterValue;
      case "GREATER_THAN":
        return Number(fieldValue) > Number(filterValue);
      case "GREATER_THAN_OR_EQUAL":
        return Number(fieldValue) >= Number(filterValue);
      case "LESS_THAN":
        return Number(fieldValue) < Number(filterValue);
      case "LESS_THAN_OR_EQUAL":
        return Number(fieldValue) <= Number(filterValue);
      default:
        return false;
    }
  }
  return true;
}

/** Check if a precondition is satisfied */
function checkPrecondition(
  doc: StoredDoc | undefined,
  precondition: Record<string, unknown> | undefined,
): boolean {
  if (!precondition) return true;
  if ("exists" in precondition) {
    if (precondition.exists === true) return !!doc;
    if (precondition.exists === false) return !doc;
  }
  if ("updateTime" in precondition) {
    if (!doc) return false;
    return doc.updateTime === precondition.updateTime;
  }
  return true;
}

/** Parse JSON body from request */
function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** Create the HTTP server */
export function createFirestoreEmulator(port = 8080): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      res.setHeader("content-type", "application/json");

      try {
        const url = req.url ?? "";
        const method = req.method ?? "GET";
        const body = await parseBody(req);

        // ---- Document GET (read by path) or Collection list ----
        if (method === "GET") {
          const docPath = getDocPath("", url);
          if (docPath) {
            const segments = docPath.split("/");
            // Odd number of segments = collection (e.g., "categories" or "categories/x/subcategories")
            // Even number = document (e.g., "categories/x")
            if (segments.length % 2 === 1) {
              // Collection list — return all documents under this collection
              const prefix = docPath + "/";
              const docs: StoredDoc[] = [];
              for (const [path, doc] of store.entries()) {
                if (path.startsWith(prefix)) {
                  // Ensure it's a direct child (not a grandchild)
                  const rest = path.slice(prefix.length);
                  if (!rest.includes("/")) {
                    docs.push(doc);
                  }
                }
              }
              res.end(JSON.stringify({ documents: docs }));
              return;
            }
            // Even segments = document read
            const doc = store.get(docPath);
            if (!doc) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: { code: 404, message: "Document not found" } }));
              return;
            }
            res.end(
              JSON.stringify({
                name: `projects/test-project/databases/(default)/documents/${docPath}`,
                fields: doc.fields,
                createTime: doc.createTime,
                updateTime: doc.updateTime,
              }),
            );
            return;
          }
        }

        // ---- Document PATCH (create or update) ----
        if (method === "PATCH") {
          const docPath = getDocPath("", url);

          // Check precondition from body
          const precondition = body.currentDocument as Record<string, unknown> | undefined;
          const existing = store.get(docPath);

          if (!checkPrecondition(existing, precondition)) {
            res.statusCode = 409;
            res.end(
              JSON.stringify({
                error: { code: 409, message: "FAILED_PRECONDITION: precondition check failed" },
              }),
            );
            return;
          }

          const fields = body.fields as Record<string, unknown>;
          const now = new Date().toISOString();

          if (existing) {
            // Merge: update existing fields, keep others
            const merged = { ...existing.fields, ...fields };
            // Handle null values (should be set to null, not removed)
            for (const [k, v] of Object.entries(fields)) {
              if (v && typeof v === "object" && "nullValue" in v) {
                merged[k] = { nullValue: null };
              }
            }
            store.set(docPath, {
              name: `projects/test-project/databases/(default)/documents/${docPath}`,
              fields: merged,
              createTime: existing.createTime,
              updateTime: now,
            });
          } else {
            store.set(docPath, {
              name: `projects/test-project/databases/(default)/documents/${docPath}`,
              fields,
              createTime: now,
              updateTime: now,
            });
          }

          res.end(
            JSON.stringify({
              name: `projects/test-project/databases/(default)/documents/${docPath}`,
              fields: store.get(docPath)!.fields,
              createTime: store.get(docPath)!.createTime,
              updateTime: now,
            }),
          );
          return;
        }

        // ---- Document DELETE ----
        if (method === "DELETE") {
          const docPath = getDocPath("", url);
          store.delete(docPath);
          res.end(JSON.stringify({}));
          return;
        }

        // ---- runQuery ----
        if (url.includes(":runQuery") && method === "POST") {
          const structuredQuery = body.structuredQuery as {
            from: Array<{ collectionId: string }>;
            where?: Record<string, unknown>;
            limit?: number;
          };

          const collectionId = structuredQuery.from?.[0]?.collectionId;
          if (!collectionId) {
            res.end(JSON.stringify([]));
            return;
          }

          // Determine parent path from URL
          // URL: /v1/projects/{project}/databases/(default)/documents/{parentPath}:runQuery
          const runQueryMatch = url.match(
            /\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/(.+):runQuery/,
          );
          const parentPath = runQueryMatch ? runQueryMatch[1] : "";

          // If no parent in URL, query top-level collection
          // Handle case where parentPath already ends with the collectionId
          // (e.g., /sellers/{uid}/walletTx:runQuery with from: walletTx)
          let prefix: string;
          if (parentPath && parentPath.endsWith("/" + collectionId)) {
            // Parent path already includes the collection — use it directly
            prefix = parentPath + "/";
          } else {
            prefix = parentPath ? `${parentPath}/${collectionId}/` : `${collectionId}/`;
          }
          const results: StoredDoc[] = [];
          for (const [path, doc] of store.entries()) {
            if (path.startsWith(prefix)) {
              if (!structuredQuery.where || matchesFilter(doc.fields, structuredQuery.where)) {
                results.push(doc);
              }
            }
          }

          const limit = structuredQuery.limit ?? 100;
          const limited = results.slice(0, limit);

          res.end(
            JSON.stringify(
              limited.map((doc) => ({
                document: {
                  name: doc.name,
                  fields: doc.fields,
                  createTime: doc.createTime,
                  updateTime: doc.updateTime,
                },
                readTime: new Date().toISOString(),
              })),
            ),
          );
          return;
        }

        // ---- batchGet ----
        if (url.includes(":batchGet") && method === "POST") {
          const documents = (body.documents as string[]) ?? [];
          const result: Array<Record<string, unknown>> = [];
          for (const docName of documents) {
            // docName is a full path like projects/{project}/databases/(default)/documents/{path}
            const match = docName.match(/\/databases\/\(default\)\/documents\/(.+)$/);
            const path = match ? match[1] : "";
            const doc = store.get(path);
            if (doc) {
              result.push({
                found: {
                  name: doc.name,
                  fields: doc.fields,
                  createTime: doc.createTime,
                  updateTime: doc.updateTime,
                },
              });
            } else {
              result.push({ missing: docName });
            }
          }
          res.end(JSON.stringify(result));
          return;
        }

        // ---- commit (batch writes) ----
        if (url.includes(":commit") && method === "POST") {
          const writes = (body.writes as Array<Record<string, unknown>>) ?? [];
          const now = new Date().toISOString();

          for (const write of writes) {
            if (write.update) {
              const updateOp = write.update as {
                name: string;
                fields: Record<string, unknown>;
              };
              const match = updateOp.name.match(/\/databases\/\(default\)\/documents\/(.+)$/);
              const path = match ? match[1] : "";
              const precondition = write.currentDocument as Record<string, unknown> | undefined;
              const existing = store.get(path);

              if (!checkPrecondition(existing, precondition)) {
                res.statusCode = 409;
                res.end(
                  JSON.stringify({
                    error: {
                      code: 409,
                      message: "FAILED_PRECONDITION: batch write precondition failed",
                    },
                  }),
                );
                return;
              }

              if (existing) {
                // Check for updateMask — if present, apply only the specified
                // field paths (supports dotted/nested paths)
                const updateMask = (write as Record<string, unknown>).updateMask as
                  { fieldPaths?: string[] } | undefined;
                if (updateMask?.fieldPaths && updateMask.fieldPaths.length > 0) {
                  // Apply only masked fields (nested-aware)
                  const newFields = { ...existing.fields };
                  for (const fieldPath of updateMask.fieldPaths) {
                    if (fieldPath in updateOp.fields) {
                      const fieldVal = updateOp.fields[fieldPath] as Record<string, unknown>;
                      if (fieldPath.includes(".")) {
                        setNestedField(newFields, fieldPath, fieldVal);
                      } else {
                        newFields[fieldPath] = updateOp.fields[fieldPath];
                      }
                    }
                  }
                  store.set(path, {
                    name: updateOp.name,
                    fields: newFields,
                    createTime: existing.createTime,
                    updateTime: now,
                  });
                } else {
                  store.set(path, {
                    name: updateOp.name,
                    fields: { ...existing.fields, ...updateOp.fields },
                    createTime: existing.createTime,
                    updateTime: now,
                  });
                }
              } else {
                store.set(path, {
                  name: updateOp.name,
                  fields: updateOp.fields,
                  createTime: now,
                  updateTime: now,
                });
              }
            }
            if (write.delete) {
              const delPath = (write.delete as string).match(
                /\/databases\/\(default\)\/documents\/(.+)$/,
              );
              if (delPath) store.delete(delPath[1]);
            }
          }

          res.end(
            JSON.stringify({
              writeResults: writes.map(() => ({ updateTime: now })),
            }),
          );
          return;
        }

        // ---- Unknown endpoint ----
        res.statusCode = 404;
        res.end(JSON.stringify({ error: { code: 404, message: `Unknown: ${method} ${url}` } }));
      } catch (err) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: { code: 500, message: err instanceof Error ? err.message : "Internal error" },
          }),
        );
      }
    });

    server.listen(port, "127.0.0.1", () => {
      resolve(server);
    });
  });
}

/** Clear all documents (between tests) */
export function clearEmulatorStore(): void {
  store.clear();
}

/** Get a document directly from the store (for test assertions) */
export function getEmulatorDoc(path: string): Record<string, unknown> | null {
  const doc = store.get(path);
  if (!doc) return null;
  return decodeFields(doc.fields);
}

/** Get all docs matching a prefix */
export function listEmulatorDocs(prefix: string): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const [path, doc] of store.entries()) {
    if (path.startsWith(prefix)) {
      result.set(path, decodeFields(doc.fields));
    }
  }
  return result;
}

/** Count documents matching a prefix */
export function countEmulatorDocs(prefix: string): number {
  let count = 0;
  for (const path of store.keys()) {
    if (path.startsWith(prefix)) count++;
  }
  return count;
}

/** Close the emulator server */
export function closeFirestoreEmulator(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
