import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AVATAR_OBJECT_FILE_NAME,
  buildAvatarCleanupPathsForProfileChange,
  getCanonicalAvatarObjectPath,
  resolveAvatarObjectPathFromPublicUrl,
} from "@cadence/shared/profile/avatar-paths";
import type { Database } from "@/lib/supabase/database.types";

export const AVATAR_UPLOAD_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export {
  AVATAR_OBJECT_FILE_NAME,
  buildAvatarCleanupPathsForProfileChange,
  getCanonicalAvatarObjectPath,
  resolveAvatarObjectPathFromPublicUrl,
};

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

async function readImageElementFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode avatar image."));
    };
    image.src = objectUrl;
  });
}

async function convertImageToJpegBlob(file: File): Promise<Blob> {
  const maxWidth = 600;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let drawImage: CanvasImageSource | null = null;

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
      drawImage = bitmap;
    } catch {
      drawImage = null;
    }
  }

  if (!drawImage) {
    const image = await readImageElementFromFile(file);
    sourceWidth = image.naturalWidth;
    sourceHeight = image.naturalHeight;
    drawImage = image;
  }

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Could not decode avatar image.");
  }

  const targetWidth = Math.min(sourceWidth, maxWidth);
  const targetHeight = Math.max(
    1,
    Math.round((sourceHeight / sourceWidth) * targetWidth)
  );
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare avatar image.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(drawImage, 0, 0, targetWidth, targetHeight);

  if (typeof ImageBitmap !== "undefined" && drawImage instanceof ImageBitmap) {
    drawImage.close();
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode avatar image."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.82
    );
  });
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
  const objectPath = getCanonicalAvatarObjectPath(userId);
  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_UPLOAD_BUCKET).getPublicUrl(objectPath);
  assertUploadedAvatarPublicUrl(publicUrl);

  const uploadBlob = await convertImageToJpegBlob(file);
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_UPLOAD_BUCKET)
    .upload(objectPath, uploadBlob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }
  return `${publicUrl}?v=${Date.now()}`;
}

export async function deleteProfileAvatar({
  supabase,
  objectPaths,
}: {
  supabase: SupabaseClient<Database>;
  objectPaths: string[];
}) {
  const deletePaths = Array.from(
    new Set(objectPaths.map((path) => path.trim()).filter((path) => path.length > 0))
  );
  if (deletePaths.length === 0) {
    return;
  }
  const { error } = await supabase.storage
    .from(AVATAR_UPLOAD_BUCKET)
    .remove(deletePaths);
  if (error) {
    throw error;
  }
}
