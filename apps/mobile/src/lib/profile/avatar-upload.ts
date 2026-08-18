import * as ImageManipulator from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import {
  buildAvatarCleanupPathsForProfileChange,
  getCanonicalAvatarObjectPath,
  resolveAvatarObjectPathFromPublicUrl,
} from "@cadence/shared/profile/avatar-paths";
import { mobileEnv } from "../../config/env";
import { supabase } from "../supabase";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export {
  buildAvatarCleanupPathsForProfileChange as buildMobileAvatarCleanupPathsForProfileChange,
  getCanonicalAvatarObjectPath as getMobileCanonicalAvatarObjectPath,
  resolveAvatarObjectPathFromPublicUrl as resolveMobileAvatarObjectPathFromUrl,
};

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

function validateUploadedAvatarUrl(publicUrl: string) {
  const parsed = new URL(publicUrl);
  const expectedOrigin = new URL(mobileEnv.supabaseUrl).origin;
  if (parsed.origin !== expectedOrigin) {
    throw new Error("Avatar URL origin mismatch.");
  }
  if (!parsed.pathname.startsWith("/storage/v1/object/public/avatars/")) {
    throw new Error("Avatar URL path mismatch.");
  }
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
    [{ resize: { width: 1600 } }],
    { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) {
    throw new Error("Could not read avatar photo.");
  }

  const objectPath = getCanonicalAvatarObjectPath(userId);
  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
  validateUploadedAvatarUrl(publicUrl);

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(objectPath, await decodeBase64(manipulated.base64), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) {
    throw uploadError;
  }
  return `${publicUrl}?v=${Date.now()}`;
}

export async function deleteMobileProfileAvatar({
  objectPaths,
}: {
  objectPaths: string[];
}) {
  const deletePaths = Array.from(
    new Set(objectPaths.map((path) => path.trim()).filter((path) => path.length > 0))
  );
  if (deletePaths.length === 0) {
    return;
  }
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(deletePaths);
  if (error) {
    throw error;
  }
}
