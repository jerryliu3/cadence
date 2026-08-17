export function normalizeAvatarUrlDraft(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getAvatarUrlValidationError(
  avatarUrl: string | null
): string | null {
  if (!avatarUrl) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(avatarUrl);
  } catch {
    return "Avatar URL must be a valid absolute URL.";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Avatar URL must start with http:// or https://.";
  }

  if (!parsed.pathname.startsWith("/storage/v1/object/public/avatars/")) {
    return "Avatar URL must point to the public avatars storage path.";
  }

  return null;
}
