import * as ImageManipulator from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import { mobileEnv } from "../../config/env";
import { supabase } from "../supabase";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_OBJECT_FILE_NAME = "avatar.jpg";
const AVATAR_PUBLIC_PATH_PREFIX = "/storage/v1/object/public/avatars/";

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

function resolveAvatarObjectPathFromUrl(avatarUrl: string | null) {
  if (!avatarUrl) {
    return null;
  }
  try {
    const parsed = new URL(avatarUrl);
    if (!parsed.pathname.startsWith(AVATAR_PUBLIC_PATH_PREFIX)) {
      return null;
    }
    const objectPath = decodeURIComponent(
      parsed.pathname.slice(AVATAR_PUBLIC_PATH_PREFIX.length)
    );
    return objectPath.length > 0 ? objectPath : null;
  } catch {
    return null;
  }
}

function buildAvatarDeletePaths({
  userId,
  avatarUrl,
}: {
  userId: string;
  avatarUrl: string | null;
}) {
  const paths = new Set<string>([`${userId}/${AVATAR_OBJECT_FILE_NAME}`]);
  const parsedPath = resolveAvatarObjectPathFromUrl(avatarUrl);
  if (parsedPath && parsedPath.startsWith(`${userId}/`)) {
    paths.add(parsedPath);
  }
  return Array.from(paths);
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

  const objectPath = `${userId}/${AVATAR_OBJECT_FILE_NAME}`;
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
  validateUploadedAvatarUrl(publicUrl);
  return `${publicUrl}?v=${Date.now()}`;
}

export async function deleteMobileProfileAvatar({
  userId,
  avatarUrl,
}: {
  userId: string;
  avatarUrl: string | null;
}) {
  const deletePaths = buildAvatarDeletePaths({ userId, avatarUrl });
  if (deletePaths.length === 0) {
    return;
  }
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(deletePaths);
  if (error) {
    throw error;
  }
}
