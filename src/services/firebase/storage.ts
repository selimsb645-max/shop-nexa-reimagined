/**
 * Image storage service — uses Cloudinary for all uploads (avatars, shop
 * logos, product images) with automatic compression and CDN delivery.
 */

import { uploadToCloudinary } from "@/services/cloudinary";

function validateImage(file: File, maxMb = 5) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > maxMb * 1024 * 1024) throw new Error(`Image must be smaller than ${maxMb}MB.`);
}

/**
 * Upload a user avatar to Cloudinary.
 * Returns the optimized CDN URL.
 */
export async function uploadAvatar(uid: string, file: File): Promise<string> {
  validateImage(file, 5);
  const result = await uploadToCloudinary(file, "avatars", [`uid:${uid}`]);
  return result.url;
}

/**
 * Upload a seller shop logo to Cloudinary.
 * Returns the optimized CDN URL.
 */
export async function uploadShopLogo(uid: string, file: File): Promise<string> {
  validateImage(file, 5);
  const result = await uploadToCloudinary(file, "logos", [`uid:${uid}`]);
  return result.url;
}

/**
 * Upload a product image to Cloudinary.
 * Returns the CDN URL and a pseudo-path (public ID) for deletion support.
 */
export async function uploadProductImage(
  uid: string,
  productId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  validateImage(file, 8);
  const result = await uploadToCloudinary(file, "products", [`uid:${uid}`, `pid:${productId}`]);
  return { url: result.url, path: result.publicId };
}
