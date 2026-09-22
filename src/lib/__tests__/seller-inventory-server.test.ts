/**
 * AVENTA SHOP — Seller Inventory server transport: static audit
 *
 * Pins the authorization chain for the seller "Update stock" action:
 * identity comes ONLY from the verified Firebase ID token (never a
 * client-supplied sellerId), ownership is re-checked server-side, and
 * the reserved/sold invariant can never go negative.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function read(relative: string): string {
  return fs.readFileSync(path.join("src", relative), "utf-8");
}

const TRANSPORT = read("lib/seller-inventory.functions.ts");
const SERVER = read("lib/seller-inventory.server.ts");
const RULES = fs.readFileSync("firestore.rules", "utf-8");

describe("Seller Inventory transport — restockProduct", () => {
  it("input schema accepts no seller identity field", () => {
    const schemaMatch = TRANSPORT.match(/const restockSchema = z\.object\(\{([\s\S]*?)\}\);/);
    expect(schemaMatch, "restockSchema not found").toBeTruthy();
    const body = schemaMatch![1];
    expect(body).not.toMatch(/\bsellerId\b/);
    expect(body).toMatch(/idToken/);
    expect(body).toMatch(/productId/);
    expect(body).toMatch(/newStock/);
  });

  it("server function derives the caller identity from verifyIdToken, not a param", () => {
    expect(SERVER).toMatch(/verifyIdToken\(idToken\)/);
  });

  it("server function re-checks product ownership before writing stock", () => {
    expect(SERVER).toMatch(/counters\.sellerId !== sellerId/);
  });

  it("server function rejects a stock value below already reserved + sold units", () => {
    expect(SERVER).toMatch(/committedUnits = counters\.reservedStock \+ counters\.soldStock/);
    expect(SERVER).toMatch(/newStock < committedUnits/);
  });

  it("only sets stock/availableStock/updatedAt — never reservedStock or soldStock", () => {
    const writeMatch = SERVER.match(/toFsFields\(\{([\s\S]*?)\}\)/);
    expect(writeMatch, "stock write fields not found").toBeTruthy();
    const fields = writeMatch![1];
    expect(fields).toMatch(/stock:/);
    expect(fields).toMatch(/availableStock:/);
    expect(fields).not.toMatch(/reservedStock/);
    expect(fields).not.toMatch(/soldStock/);
  });

  it("Firestore rules still block client SDK writes to product stock fields", () => {
    // Guards against this server function ever being treated as a
    // reason to relax the rule — the rule must keep blocking direct
    // client writes to the counters (this transport is the only
    // sanctioned way to change seller-declared stock).
    expect(RULES).toMatch(
      /affectedKeys\(\)\s*\n?\s*\.hasAny\(\['stock', 'availableStock', 'reservedStock', 'soldStock'\]\)/,
    );
  });
});
