/**
 * Image storage service — uses ImageKit (signed uploads) for all uploads
 * (avatars, shop logos, product images) with automatic CDN optimization.
 */

import { uploadToImageKit } from "@/services/imagekit";

function validateImage(file: File, maxMb = 5) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > maxMb * 1024 * 1024) throw new Error(`Image must be smaller than ${maxMb}MB.`);
}

/**
 * Upload a user avatar to ImageKit.
 * Returns the optimized CDN URL.
 */
export async function uploadAvatar(uid: string, file: File): Promise<string> {
  validateImage(file, 5);
  const result = await uploadToImageKit(file, "avatars", [`uid:${uid}`]);
  return result.url;
}

/**
 * Upload a seller shop logo to ImageKit.
 * Returns the optimized CDN URL.
 */
export async function uploadShopLogo(uid: string, file: File): Promise<string> {
  validateImage(file, 5);
  const result = await uploadToImageKit(file, "logos", [`uid:${uid}`]);
  return result.url;
}

/**
 * Upload a store banner image (wide cover shown on the public store page).
 * Returns the CDN URL.
 */
export async function uploadShopBanner(uid: string, file: File): Promise<string> {
  validateImage(file, 5);
  const result = await uploadToImageKit(file, "banners", [`uid:${uid}`]);
  return result.url;
}

/**
 * Upload a product image to ImageKit.
 * Returns the CDN URL and a pseudo-path (public ID) for deletion support.
 */
export async function uploadProductImage(
  uid: string,
  productId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  validateImage(file, 8);
  const result = await uploadToImageKit(file, "products", [`uid:${uid}`, `pid:${productId}`]);
  return { url: result.url, path: result.publicId };
}
