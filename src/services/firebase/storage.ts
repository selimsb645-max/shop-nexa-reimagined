/**
 * Image storage service — uses Cloudinary for all uploads (avatars, shop
 * logos, product images) with automatic compression and CDN delivery.
 *
 * Firebase Storage functions (deleteObject, ref, uploadBytes) are kept
 * only for backward-compatible deletion of legacy Firebase-hosted assets.
 */

import { deleteObject, ref } from "firebase/storage";
import { getStorageBucket } from "./config";
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
  const result = await uploadToCloudinary(file, "products", [
    `uid:${uid}`,
    `pid:${productId}`,
  ]);
  return { url: result.url, path: result.publicId };
}

/**
 * Delete a storage object.
 * For Cloudinary assets, the path is the public_id — we skip deletion
 * here (unsigned uploads can't delete via client-side API). Cloudinary's
 * unused-asset auto-cleanup can handle this, or it can be done via admin API.
 * For legacy Firebase Storage assets, deletion proceeds normally.
 */
export async function deleteStorageObject(path: string): Promise<void> {
  // Cloudinary public IDs contain "/" but not Firebase Storage paths
  // Legacy Firebase paths look like "sellers/{uid}/products/{pid}/{uuid}.ext"
  // Cloudinary public IDs look like "shop-nexa/products/xxxxx"
  if (path.startsWith("shop-nexa/")) {
    // Cloudinary asset — skip client-side deletion (requires admin API)
    return;
  }
  try {
    await deleteObject(ref(getStorageBucket(), path));
  } catch {
    // Ignore missing objects.
  }
}
