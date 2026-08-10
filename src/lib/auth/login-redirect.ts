const DEFAULT_POST_LOGIN_PATH = "/";

function isSafeRelativePath(path: string) {
  return path.startsWith("/") && !path.startsWith("//");
}

export function resolveSafePostLoginPath(candidatePath?: string | null) {
  const normalized = candidatePath?.trim();
  if (!normalized || !isSafeRelativePath(normalized)) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  if (normalized.startsWith("/login")) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return normalized;
}

export function buildLoginHref(nextPath?: string | null) {
  const safeNextPath = resolveSafePostLoginPath(nextPath);
  const query = new URLSearchParams({
    next: safeNextPath,
  });
  return `/login?${query.toString()}`;
}
