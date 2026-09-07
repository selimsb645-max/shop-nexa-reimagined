/**
 * Image-storage audit (Sep 7, 2026) — Firebase Storage removal lock.
 *
 * Covers the banner migration to Cloudinary, the unchanged product /
 * avatar / logo upload flows, and the repository-wide static guarantees:
 *  - no `firebase/storage` SDK usage anywhere in src/ (dependency = NONE)
 *  - banner METADATA writes stay admin-gated in the Firestore rules
 *  - firebase.json no longer deploys storage rules
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = path.resolve("src");
const read = (rel: string) => fs.readFileSync(rel, "utf-8");

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function pngFile(sizeBytes = 100): File {
  return new File([new Uint8Array(sizeBytes)], "img.png", { type: "image/png" });
}

describe("Cloudinary upload flows (mocked fetch)", () => {
  let calls: Array<{ url: string; body: FormData }>;

  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: FormData }) => {
        calls.push({ url, body: init.body });
        return {
          ok: true,
          text: async () => "",
          json: async () => ({
            secure_url: "https://res.cloudinary.com/cwq5zgzp/image/upload/v1/shop-nexa/test",
            public_id: "shop-nexa/test",
            bytes: 42,
            format: "png",
            width: 10,
            height: 10,
          }),
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("banner upload goes to the Cloudinary banners folder and returns the persisted CDN URL", async () => {
    const { uploadBannerImage } = await import("@/services/firebase/adminSettings");
    const url = await uploadBannerImage(pngFile());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.cloudinary.com/v1_1/cwq5zgzp/image/upload");
    expect(calls[0].body.get("folder")).toBe("shop-nexa/banners");
    expect(calls[0].body.get("upload_preset")).toBe("aventa_products");
    expect(calls[0].body.get("tags")).toBe("banner");
    // The URL that admin.banners.tsx persists into the banner doc imageUrl:
    expect(url).toContain("res.cloudinary.com");
    expect(url).not.toContain("firebasestorage");
  });

  it("rejects non-image and oversized banner uploads before any network call", async () => {
    const { uploadBannerImage } = await import("@/services/firebase/adminSettings");
    const badType = new File([new Uint8Array(10)], "a.txt", { type: "text/plain" });
    await expect(uploadBannerImage(badType)).rejects.toThrow(/image/i);
    expect(calls).toHaveLength(0);

    const huge = new File([new Uint8Array(9 * 1024 * 1024)], "big.png", { type: "image/png" });
    await expect(uploadBannerImage(huge)).rejects.toThrow(/smaller/i);
    expect(calls).toHaveLength(0);
  });

  it("product image flow unchanged — products folder, url + publicId path", async () => {
    const { uploadProductImage } = await import("@/services/firebase/storage");
    const result = await uploadProductImage("sellerA", "prod1", pngFile());

    expect(calls[0].body.get("folder")).toBe("shop-nexa/products");
    expect(calls[0].body.get("tags")).toBe("uid:sellerA,pid:prod1");
    expect(result.url).toContain("res.cloudinary.com");
    expect(result.path).toBe("shop-nexa/test");
  });

  it("avatar flow unchanged — avatars folder with uid tag", async () => {
    const { uploadAvatar } = await import("@/services/firebase/storage");
    const url = await uploadAvatar("userA", pngFile());

    expect(calls[0].body.get("folder")).toBe("shop-nexa/avatars");
    expect(calls[0].body.get("tags")).toBe("uid:userA");
    expect(url).toContain("res.cloudinary.com");
  });

  it("shop logo flow unchanged — logos folder with uid tag", async () => {
    const { uploadShopLogo } = await import("@/services/firebase/storage");
    const url = await uploadShopLogo("sellerB", pngFile());

    expect(calls[0].body.get("folder")).toBe("shop-nexa/logos");
    expect(calls[0].body.get("tags")).toBe("uid:sellerB");
    expect(url).toContain("res.cloudinary.com");
  });
});

describe("Banner metadata authorization (static rules audit)", () => {
  const rules = read("firestore.rules");

  it("banners collection is publicly readable but writes are admin-gated (canWriteMasterData)", () => {
    const block = rules.match(/match \/banners\/\{id\} \{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain("allow read: if true;");
    expect(block![0]).toContain("allow write: if canWriteMasterData();");
    // No client-open write path on banner metadata.
    expect(block![0]).not.toMatch(/allow (write|create|update)[^:]*: if (true|isSignedIn\(\))/);
  });

  it("canWriteMasterData only grants the admin/marketing roles", () => {
    const fn = rules.match(/function canWriteMasterData\(\) \{[^}]*\}/);
    expect(fn).not.toBeNull();
    expect(fn![0]).toContain("super_admin");
    expect(fn![0]).toContain("admin");
    expect(fn![0]).not.toContain("isApprovedSeller");
  });

  it("admin.banners route persists the uploaded URL into the banner imageUrl field", () => {
    const route = read("src/routes/_authenticated/admin.banners.tsx");
    expect(route).toContain("uploadBannerImage");
    expect(route).toMatch(/imageUrl:\s*url/);
  });
});

describe("Firebase Storage removal lock (static)", () => {
  it("no file in src/ imports the Firebase Storage SDK", () => {
    const offenders = collectSourceFiles(SRC_ROOT).filter((f) =>
      /from ["']firebase\/storage["']/.test(fs.readFileSync(f, "utf-8")),
    );
    expect(offenders).toEqual([]);
  });

  it("removed Firebase Storage surface no longer exists anywhere in src/", () => {
    const offenders = collectSourceFiles(SRC_ROOT).filter((f) =>
      /deleteStorageObject|getStorageBucket|getStorage\(|uploadBytes|firebasestorage/.test(
        fs.readFileSync(f, "utf-8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("firebase.json no longer targets storage rules", () => {
    const cfg = JSON.parse(read("firebase.json"));
    expect(cfg.storage).toBeUndefined();
    expect(cfg.firestore.rules).toBe("firestore.rules");
  });
});
