/**
 * ImageKit Image Service
 *
 * Handles image uploads with automatic CDN optimization (WebP/AVIF via
 * f-auto, auto quality) and responsive URL generation.
 *
 * SECURITY: uploads are SIGNED. The client first fetches short-lived
 * upload credentials (signature/token/expire) from the server (which
 * verifies the Firebase ID token), then uploads directly to ImageKit.
 * The private API key never reaches the browser. This replaces the old
 * Cloudinary unsigned-preset flow that allowed unauthenticated uploads.
 */

// ─── Configuration ──────────────────────────────────────────────
// Public config — safe to ship in client code (same principle as the
// old Cloudinary cloud name). Env vars override for flexibility.
const URL_ENDPOINT =
  (import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT as string | undefined) ||
  "https://ik.imagekit.io/a54npygmh";
const PUBLIC_KEY = (import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY as string | undefined) || "";

const UPLOAD_API = "https://upload.imagekit.io/api/v1/files/upload";

function isConfigured(): boolean {
  return Boolean(URL_ENDPOINT && PUBLIC_KEY);
}

// ─── Upload ─────────────────────────────────────────────────────

export interface ImageKitUploadResult {
  url: string;
  publicId: string;
  compressedBytes: number;
  format: string;
  width: number;
  height: number;
}

function validateImage(file: File, maxMb = 8): void {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > maxMb * 1024 * 1024) throw new Error(`Image must be smaller than ${maxMb}MB.`);
}

function sanitizeFileName(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return clean || "upload";
}

async function getCurrentIdToken(): Promise<string> {
  const { getAuth } = await import("firebase/auth");
  const user = getAuth().currentUser;
  if (!user) throw new Error("Please sign in before uploading images.");
  return user.getIdToken();
}

/**
 * Upload an image to ImageKit with a server-signed upload request.
 * `folder` is a sub-folder inside the shop-nexa/ root; `tags` attach
 * ownership metadata (e.g. uid:<uid>, pid:<product id>).
 */
export async function uploadToImageKit(
  file: File,
  folder: string = "products",
  tags: string[] = [],
): Promise<ImageKitUploadResult> {
  validateImage(file);

  if (!isConfigured()) {
    throw new Error("ImageKit is not configured. Set VITE_IMAGEKIT_PUBLIC_KEY in .env");
  }

  // 1. Short-lived signed credentials from our server (verifies the user).
  const idToken = await getCurrentIdToken();
  const { getImageKitAuthFn } = await import("@/lib/imagekit-auth.functions");
  const { signature, token, expire } = await getImageKitAuthFn({ data: { idToken } });

  // 2. Direct signed upload to ImageKit's upload API.
  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", sanitizeFileName(file.name));
  formData.append("folder", `shop-nexa/${folder}`);
  formData.append("publicKey", PUBLIC_KEY);
  formData.append("signature", signature);
  formData.append("token", token);
  formData.append("expire", String(expire));
  formData.append("useUniqueFileName", "true");
  formData.append("overwriteFile", "false");
  if (tags.length > 0) {
    formData.append("tags", tags.join(","));
  }

  const response = await fetch(UPLOAD_API, { method: "POST", body: formData });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ImageKit upload failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();

  return {
    url: data.url,
    publicId: (data.filePath ?? "").replace(/^\//, ""),
    compressedBytes: data.size ?? 0,
    format: (data.name ?? "").split(".").pop() ?? "",
    width: data.width ?? 0,
    height: data.height ?? 0,
  };
}

// ─── Optimized URL Generation ───────────────────────────────────

/**
 * Generate an optimized ImageKit URL from a file path or full URL.
 * Applies auto format (WebP/AVIF), auto quality, and optional resizing.
 * Non-ImageKit URLs (e.g. legacy hosts) are returned as-is — graceful
 * fallback, never a crash.
 */
export function getOptimizedImageUrl(source: string, width?: number): string {
  if (!source) return source;

  // Already transformed ImageKit URL — return as-is
  if (source.includes("/tr:")) return source;

  let p = source;
  if (source.startsWith("http")) {
    // External or legacy host — return as-is
    if (!source.includes("ik.imagekit.io")) return source;
    try {
      const u = new URL(source);
      const pathname = u.pathname;
      const endpoint = new URL(URL_ENDPOINT);
      if (pathname.startsWith(endpoint.pathname)) {
        // Standard https://ik.imagekit.io/{imagekitId}/{path} format
        p = pathname.slice(endpoint.pathname.length).replace(/^\//, "");
      } else if (u.hostname === "ik.imagekit.io") {
        // Different ImageKit ID in the endpoint — strip the ID segment
        p = pathname.replace(/^\//, "").split("/").slice(1).join("/");
      } else {
        p = pathname.replace(/^\//, "");
      }
      if (!p) return source;
    } catch {
      return source;
    }
  } else {
    p = p.replace(/^\//, "");
    if (!p.startsWith("shop-nexa/")) return source;
  }

  const tr = ["q-80", "f-auto", ...(width ? [`w-${width}`] : [])].join(",");
  return `${URL_ENDPOINT}/tr:${tr}/${p}`;
}

/**
 * Generate a srcset string for responsive images.
 */
export function getResponsiveSrcSet(
  source: string,
  widths: number[] = [200, 400, 600, 800, 1200],
): string {
  return widths.map((w) => `${getOptimizedImageUrl(source, w)} ${w}w`).join(", ");
}

// ─── Utility ────────────────────────────────────────────────────

export function isImageKitUrl(url: string): boolean {
  return url.includes("ik.imagekit.io");
}

export function isImageKitConfigured(): boolean {
  return isConfigured();
}
