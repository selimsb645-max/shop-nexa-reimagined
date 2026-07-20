import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getStorageBucket } from "./config";

function validateImage(file: File, maxMb = 5) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > maxMb * 1024 * 1024) throw new Error(`Image must be smaller than ${maxMb}MB.`);
}

export async function uploadAvatar(uid: string, file: File): Promise<string> {
  validateImage(file);
  const storage = getStorageBucket();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const objectRef = ref(storage, `avatars/${uid}/avatar.${ext}`);
  await uploadBytes(objectRef, file, { contentType: file.type });
  return await getDownloadURL(objectRef);
}

export async function uploadShopLogo(uid: string, file: File): Promise<string> {
  validateImage(file);
  const storage = getStorageBucket();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const objectRef = ref(storage, `sellers/${uid}/logo.${ext}`);
  await uploadBytes(objectRef, file, { contentType: file.type });
  return await getDownloadURL(objectRef);
}

export async function uploadProductImage(
  uid: string,
  productId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  validateImage(file, 8);
  const storage = getStorageBucket();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `sellers/${uid}/products/${productId}/${crypto.randomUUID()}.${ext}`;
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, file, { contentType: file.type });
  const url = await getDownloadURL(objectRef);
  return { url, path };
}

export async function deleteStorageObject(path: string): Promise<void> {
  try {
    await deleteObject(ref(getStorageBucket(), path));
  } catch {
    // Ignore missing objects.
  }
}
