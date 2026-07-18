import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getStorageBucket } from "./config";

export async function uploadAvatar(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be smaller than 5MB.");
  const storage = getStorageBucket();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const objectRef = ref(storage, `avatars/${uid}/avatar.${ext}`);
  await uploadBytes(objectRef, file, { contentType: file.type });
  return await getDownloadURL(objectRef);
}
