/**
 * Cloudinary Image Service
 *
 * Handles product image uploads with automatic compression, format
 * optimization (WebP/AVIF), and responsive URL generation.
 *
 * Uses unsigned upload presets for client-side uploads — no API secret
 * exposed to the browser.
 */

import { Cloudinary } from "@cloudinary/url-gen";
import { autoGood } from "@cloudinary/url-gen/qualifiers/quality";
import { auto as formatAuto } from "@cloudinary/url-gen/qualifiers/format";
import { scale } from "@cloudinary/url-gen/actions/resize";

// ─── Configuration ──────────────────────────────────────────────

// Cloudinary public config — cloud name and unsigned upload preset are safe
// to ship in client code. Security is enforced via unsigned upload presets.
const CLOUD_NAME = "cwq5zgzp";
const UPLOAD_PRESET = "aventa_products";

let cloudinaryInstance: Cloudinary | null = null;

function getCloudinary(): Cloudinary {
  if (!CLOUD_NAME) {
    throw new Error(
      "VITE_CLOUDINARY_CLOUD_NAME is not set. Add it to your .env file.",
    );
  }
  if (!cloudinaryInstance) {
    cloudinaryInstance = new Cloudinary({ cloud: { cloudName: CLOUD_NAME } });
  }
  return cloudinaryInstance;
}

function isConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

// ─── Upload ─────────────────────────────────────────────────────

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  compressedBytes: number;
  format: string;
  width: number;
  height: number;
}

function validateImage(file: File, maxMb = 8): void {
  if (!file.type.startsWith("image/"))
    throw new Error("Please choose an image file.");
  if (file.size > maxMb * 1024 * 1024)
    throw new Error(`Image must be smaller than ${maxMb}MB.`);
}

/**
 * Upload an image to Cloudinary with automatic compression and optimization.
 * Uses unsigned upload preset — safe for client-side use.
 */
export async function uploadToCloudinary(
  file: File,
  folder: string = "products",
  tags: string[] = [],
): Promise<CloudinaryUploadResult> {
  validateImage(file);

  if (!isConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env",
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET!);
  formData.append("folder", `shop-nexa/${folder}`);
  if (tags.length > 0) {
    formData.append("tags", tags.join(","));
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudinary upload failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();

  return {
    url: data.secure_url,
    publicId: data.public_id,
    compressedBytes: data.bytes,
    format: data.format,
    width: data.width,
    height: data.height,
  };
}

// ─── Optimized URL Generation ───────────────────────────────────

/**
 * Generate an optimized Cloudinary URL from a public ID or full URL.
 * Applies auto format (WebP/AVIF), auto quality, and optional resizing.
 * Non-Cloudinary URLs are returned as-is (graceful fallback).
 */
export function getOptimizedImageUrl(
  source: string,
  width?: number,
): string {
  // Already transformed Cloudinary URL — return as-is
  if (source.includes("/image/upload/f_") || source.includes("/image/upload/q_")) {
    return source;
  }

  // Non-Cloudinary URL (e.g. Firebase Storage) — return as-is
  if (!source.includes("res.cloudinary.com") && !source.startsWith("shop-nexa/")) {
    return source;
  }

  try {
    const cld = getCloudinary();

    let publicId = source;
    if (source.includes("res.cloudinary.com")) {
      const match = source.match(/\/image\/upload\/(?:v\d+\/)?(.+)$/);
      if (match) publicId = match[1];
    }

    const img = cld.image(publicId);
    img.format(formatAuto());
    img.quality(autoGood());

    if (width) {
      img.resize(scale().width(width));
    }

    return img.toURL();
  } catch {
    return source;
  }
}

/**
 * Generate a srcset string for responsive images.
 */
export function getResponsiveSrcSet(
  source: string,
  widths: number[] = [200, 400, 600, 800, 1200],
): string {
  return widths
    .map((w) => `${getOptimizedImageUrl(source, w)} ${w}w`)
    .join(", ");
}

// ─── Utility ────────────────────────────────────────────────────

export function isCloudinaryUrl(url: string): boolean {
  return url.includes("res.cloudinary.com");
}

export function isCloudinaryConfigured(): boolean {
  return isConfigured();
}
