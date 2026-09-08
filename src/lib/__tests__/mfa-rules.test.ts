/**
 * firestore.rules — admin MFA security audit (regex, couponRules style).
 *
 * Locks the MFA data discipline permanently:
 *  • adminMfa: NO client read, NO client write (server-only — the
 *    service-account MFA bridge is the sole reader/writer)
 *  • mfaSessions: same — sessions are never forgeable via client SDK
 *  • Catch-all exclusion: the isSelf()/isAdmin() fallback can never
 *    reach either collection (an admin must not be able to flip
 *    their own `enabled` flag or paste their own recovery hashes)
 */
import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as typeof import("fs");

const rules = fs.readFileSync("firestore.rules", "utf-8");

function block(collection: string): string {
  const m = rules.match(
    new RegExp(`match \\/${collection}\\/\\{[a-zA-Z]+\\} \\{[\\s\\S]*?\\n {4}\\}`),
  );
  return m?.[0] ?? "";
}

describe("firestore.rules — adminMfa / mfaSessions blocks", () => {
  const adminMfa = block("adminMfa");
  const mfaSessions = block("mfaSessions");

  it("adminMfa has a dedicated match block", () => {
    expect(adminMfa).toBeTruthy();
  });

  it("adminMfa: ALL client access denied (read AND write)", () => {
    expect(adminMfa).toMatch(/allow read, write: if false;/);
    const allowLines = adminMfa
      .split("\n")
      .filter((l) => l.trim().startsWith("allow "))
      .map((l) => l.trim());
    expect(allowLines).toEqual(["allow read, write: if false;"]);
  });

  it("mfaSessions has a dedicated match block", () => {
    expect(mfaSessions).toBeTruthy();
  });

  it("mfaSessions: ALL client access denied", () => {
    expect(mfaSessions).toMatch(/allow read, write: if false;/);
  });

  it("catch-all fallback excludes both collections (isSelf/isAdmin bypass impossible)", () => {
    const catchAll = rules.match(/match \/\{sub\}\/\{docId\} \{[\s\S]*?\n {6}\}/)?.[0] ?? "";
    expect(catchAll).toBeTruthy();
    expect(catchAll).toContain("'adminMfa', 'mfaSessions'");
  });

  it("no OTHER rule line grants client access to adminMfa/mfaSessions", () => {
    const grants = rules
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.startsWith("allow ") &&
          /adminMfa|mfaSessions/.test(l) &&
          !/if false/.test(l),
      );
    expect(grants).toEqual([]);
  });
});
