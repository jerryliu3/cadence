import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const AVATAR_UPLOAD_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function normalizeFilename(name: string) {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned : "avatar.jpg";
}

export function getAvatarUploadValidationError(file: File): string | null {
  if (!AVATAR_ALLOWED_MIME_TYPES.has(file.type)) {
    return "Choose a PNG, JPEG, or WebP image.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "Avatar image must be 5 MB or smaller.";
  }
  return null;
}

function assertUploadedAvatarPublicUrl(publicUrl: string) {
  const parsed = new URL(publicUrl);
  if (!parsed.pathname.startsWith("/storage/v1/object/public/avatars/")) {
    throw new Error("Avatar upload returned an unexpected storage path.");
  }
  const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!rawSupabaseUrl) {
    return;
  }
  const expectedOrigin = new URL(rawSupabaseUrl).origin;
  if (parsed.origin !== expectedOrigin) {
    throw new Error("Avatar upload returned an unexpected storage origin.");
  }
}

export async function uploadProfileAvatar({
  supabase,
  userId,
  file,
}: {
  supabase: SupabaseClient<Database>;
  userId: string;
  file: File;
}): Promise<string> {
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const fileName = normalizeFilename(file.name);
  const baseName = fileName.replace(/\.[a-z0-9]+$/i, "");
  const objectPath = `${userId}/${baseName || "avatar"}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_UPLOAD_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_UPLOAD_BUCKET).getPublicUrl(objectPath);
  assertUploadedAvatarPublicUrl(publicUrl);
  return `${publicUrl}?v=${Date.now()}`;
}
