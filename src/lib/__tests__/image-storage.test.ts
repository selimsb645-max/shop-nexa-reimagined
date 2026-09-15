/**
 * Image-storage audit (updated Sep 15, 2026) — ImageKit migration lock.
 *
 * Covers the Cloudinary → ImageKit migration, the signed upload flow for
 * product / avatar / logo / banner images, and the repository-wide static
 * guarantees:
 *  - no Cloudinary usage anywhere in src/ (dependency = NONE — the account
 *    was permanently banned; the service must never come back)
 *  - no `firebase/storage` SDK usage anywhere in src/
 *  - the private API key stays server-side (imagekit-auth.server.ts only)
 *  - banner METADATA writes stay admin-gated in the Firestore rules
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

const FAKE_UPLOAD_RESPONSE = {
  url: "https://ik.imagekit.io/a54npygmh/shop-nexa/test_XYZ.png",
  filePath: "/shop-nexa/test_XYZ.png",
  name: "test.png",
  size: 42,
  width: 10,
  height: 10,
};

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/auth")>();
  return {
    ...actual,
    getAuth: () => ({
      currentUser: { getIdToken: async () => "fake-id-token-1234567890" },
    }),
  };
});

vi.mock("@/lib/imagekit-auth.functions", () => ({
  getImageKitAuthFn: async () => ({
    signature: "fake-signature",
    token: "fake-token",
    expire: 1900000000,
  }),
}));

describe("ImageKit signed upload flows (mocked fetch)", () => {
  let calls: Array<{ url: string; body: FormData }>;

  beforeEach(() => {
    vi.stubEnv("VITE_IMAGEKIT_PUBLIC_KEY", "public_test_key");
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: FormData }) => {
        calls.push({ url, body: init.body });
        return {
          ok: true,
          text: async () => "",
          json: async () => FAKE_UPLOAD_RESPONSE,
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("banner upload is SIGNED and goes to the ImageKit banners folder", async () => {
    const { uploadBannerImage } = await import("@/services/firebase/adminSettings");
    const url = await uploadBannerImage(pngFile());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://upload.imagekit.io/api/v1/files/upload");
    expect(calls[0].body.get("folder")).toBe("shop-nexa/banners");
    expect(calls[0].body.get("tags")).toBe("banner");
    // Signed-upload credentials must be present — never an unsigned preset.
    expect(calls[0].body.get("signature")).toBe("fake-signature");
    expect(calls[0].body.get("token")).toBe("fake-token");
    expect(calls[0].body.get("expire")).toBe("1900000000");
    expect(calls[0].body.get("publicKey")).toBe("public_test_key");
    expect(calls[0].body.get("useUniqueFileName")).toBe("true");
    expect(calls[0].body.get("upload_preset")).toBeNull();
    // The URL that admin.banners.tsx persists into the banner doc imageUrl:
    expect(url).toContain("ik.imagekit.io");
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

  it("product image flow — products folder, uid/pid tags, url + publicId path", async () => {
    const { uploadProductImage } = await import("@/services/firebase/storage");
    const result = await uploadProductImage("sellerA", "prod1", pngFile());

    expect(calls[0].body.get("folder")).toBe("shop-nexa/products");
    expect(calls[0].body.get("tags")).toBe("uid:sellerA,pid:prod1");
    expect(result.url).toContain("ik.imagekit.io");
    expect(result.path).toBe("shop-nexa/test_XYZ.png");
  });

  it("avatar flow — avatars folder with uid tag", async () => {
    const { uploadAvatar } = await import("@/services/firebase/storage");
    const url = await uploadAvatar("userA", pngFile());

    expect(calls[0].body.get("folder")).toBe("shop-nexa/avatars");
    expect(calls[0].body.get("tags")).toBe("uid:userA");
    expect(url).toContain("ik.imagekit.io");
  });

  it("shop logo flow — logos folder with uid tag", async () => {
    const { uploadShopLogo } = await import("@/services/firebase/storage");
    const url = await uploadShopLogo("sellerB", pngFile());

    expect(calls[0].body.get("folder")).toBe("shop-nexa/logos");
    expect(calls[0].body.get("tags")).toBe("uid:sellerB");
    expect(url).toContain("ik.imagekit.io");
  });
});

describe("Optimized URL generation (ImageKit)", () => {
  it("builds transformation URLs with quality, format, and width", async () => {
    const { getOptimizedImageUrl } = await import("@/services/imagekit");
    const out = getOptimizedImageUrl(
      "https://ik.imagekit.io/a54npygmh/shop-nexa/products/a.jpg",
      400,
    );
    expect(out).toBe(
      "https://ik.imagekit.io/a54npygmh/tr:q-80,f-auto,w-400/shop-nexa/products/a.jpg",
    );

    const noWidth = getOptimizedImageUrl("shop-nexa/products/a.jpg");
    expect(noWidth).toBe(
      "https://ik.imagekit.io/a54npygmh/tr:q-80,f-auto/shop-nexa/products/a.jpg",
    );
  });

  it("passes through already-transformed, external, and legacy URLs untouched", async () => {
    const { getOptimizedImageUrl } = await import("@/services/imagekit");
    const transformed = "https://ik.imagekit.io/a54npygmh/tr:w-200,q-80/f-auto/shop-nexa/a.jpg";
    expect(getOptimizedImageUrl(transformed, 400)).toBe(transformed);
    const external = "https://example.com/pic.jpg";
    expect(getOptimizedImageUrl(external, 400)).toBe(external);
    const legacy = "https://res.cloudinary.com/cwq5zgzp/image/upload/v1/shop-nexa/a.jpg";
    expect(getOptimizedImageUrl(legacy, 400)).toBe(legacy);
  });

  it("srcset formats every width", async () => {
    const { getResponsiveSrcSet } = await import("@/services/imagekit");
    const out = getResponsiveSrcSet("shop-nexa/products/a.jpg", [200, 400]);
    expect(out).toBe(
      "https://ik.imagekit.io/a54npygmh/tr:q-80,f-auto,w-200/shop-nexa/products/a.jpg 200w, " +
        "https://ik.imagekit.io/a54npygmh/tr:q-80,f-auto,w-400/shop-nexa/products/a.jpg 400w",
    );
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

describe("Cloudinary removal lock (static)", () => {
  it("no file in src/ references Cloudinary APIs or the SDK", () => {
    const offenders = collectSourceFiles(SRC_ROOT).filter((f) =>
      /cloudinary|@cloudinary\/url-gen|api\.cloudinary\.com|upload_preset/.test(
        fs.readFileSync(f, "utf-8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("@cloudinary/url-gen is no longer a dependency", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies?.["@cloudinary/url-gen"]).toBeUndefined();
    expect(pkg.devDependencies?.["@cloudinary/url-gen"]).toBeUndefined();
  });
});

describe("ImageKit private key server-only lock (static)", () => {
  it("IMAGEKIT_PRIVATE_KEY is only referenced by the server signature module", () => {
    const offenders = collectSourceFiles(SRC_ROOT).filter((f) =>
      f.includes("imagekit-auth.server")
        ? false
        : fs.readFileSync(f, "utf-8").includes("IMAGEKIT_PRIVATE_KEY"),
    );
    expect(offenders).toEqual([]);
  });

  it("the private key is never hardcoded anywhere in src/", () => {
    const offenders = collectSourceFiles(SRC_ROOT).filter((f) =>
      /private_[A-Za-z0-9+/]{20,}=/.test(fs.readFileSync(f, "utf-8")),
    );
    expect(offenders).toEqual([]);
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
