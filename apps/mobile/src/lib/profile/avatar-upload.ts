import * as ImageManipulator from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import { supabase } from "../supabase";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

async function decodeBase64(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function getMobileAvatarValidationError(
  asset: ImagePickerAsset
): string | null {
  if (asset.fileSize && asset.fileSize > AVATAR_MAX_BYTES) {
    return "Avatar image must be 5 MB or smaller.";
  }
  return null;
}

export async function uploadMobileProfileAvatar({
  userId,
  asset,
}: {
  userId: string;
  asset: ImagePickerAsset;
}) {
  const manipulated = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: 600 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) {
    throw new Error("Could not read avatar photo.");
  }

  const objectPath = `${userId}/avatar.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(objectPath, await decodeBase64(manipulated.base64), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) {
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
  return `${publicUrl}?v=${Date.now()}`;
}
