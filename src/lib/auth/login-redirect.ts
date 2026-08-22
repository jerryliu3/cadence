const DEFAULT_POST_LOGIN_PATH = "/app";
const LOGIN_PATH = "/login";
const SENTINEL_BASE_URL = "http://resolution.local";
const LEGACY_ROUTE_PREFIXES = [
  "/calendar",
  "/checklist",
  "/social",
  "/insights",
  "/settings",
] as const;

function isSafeRelativePath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }
  if (path.includes("\\")) {
    return false;
  }
  try {
    const resolved = new URL(path, SENTINEL_BASE_URL);
    return resolved.origin === SENTINEL_BASE_URL;
  } catch {
    return false;
  }
}

function normalizeSafePath(path: string) {
  const resolved = new URL(path, SENTINEL_BASE_URL);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

function isLoginPath(path: string) {
  return path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`);
}

function remapLegacyRoutePath(path: string) {
  const resolved = new URL(path, SENTINEL_BASE_URL);
  const pathname = resolved.pathname;
  if (pathname === "/") {
    return DEFAULT_POST_LOGIN_PATH;
  }
  const matchedPrefix = LEGACY_ROUTE_PREFIXES.find((prefix) =>
    pathname.startsWith(prefix)
  );
  if (!matchedPrefix) {
    return path;
  }
  return `/app${path}`;
}

export function resolveSafePostLoginPath(candidatePath?: string | null) {
  const normalized = candidatePath?.trim();
  if (!normalized || !isSafeRelativePath(normalized)) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  const safePath = remapLegacyRoutePath(normalizeSafePath(normalized));
  if (isLoginPath(new URL(safePath, SENTINEL_BASE_URL).pathname)) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return safePath;
}

export function buildLoginHref(nextPath?: string | null) {
  const safeNextPath = resolveSafePostLoginPath(nextPath);
  const query = new URLSearchParams({
    next: safeNextPath,
  });
  return `/login?${query.toString()}`;
}
