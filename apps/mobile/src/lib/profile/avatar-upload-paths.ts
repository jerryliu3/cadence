const AVATAR_OBJECT_FILE_NAME = "avatar.jpg";
const AVATAR_PUBLIC_PATH_PREFIX = "/storage/v1/object/public/avatars/";

export function getMobileCanonicalAvatarObjectPath(userId: string) {
  return `${userId}/${AVATAR_OBJECT_FILE_NAME}`;
}

export function resolveMobileAvatarObjectPathFromUrl(avatarUrl: string | null) {
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

export function buildMobileAvatarCleanupPathsForProfileChange({
  userId,
  previousAvatarUrl,
  nextAvatarUrl,
}: {
  userId: string;
  previousAvatarUrl: string | null;
  nextAvatarUrl: string | null;
}) {
  const previousObjectPath = resolveMobileAvatarObjectPathFromUrl(previousAvatarUrl);
  const nextObjectPath = resolveMobileAvatarObjectPathFromUrl(nextAvatarUrl);
  const cleanupPaths = new Set<string>();

  if (!nextAvatarUrl) {
    cleanupPaths.add(getMobileCanonicalAvatarObjectPath(userId));
    if (previousObjectPath?.startsWith(`${userId}/`)) {
      cleanupPaths.add(previousObjectPath);
    }
  } else if (
    previousObjectPath &&
    previousObjectPath.startsWith(`${userId}/`) &&
    previousObjectPath !== nextObjectPath
  ) {
    cleanupPaths.add(previousObjectPath);
  }

  return Array.from(cleanupPaths);
}
