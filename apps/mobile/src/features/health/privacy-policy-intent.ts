export const HEALTH_CONNECT_RATIONALE_ACTION =
  "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE";

export const HEALTH_PRIVACY_PATH = "/privacy";

export function shouldOpenHealthPrivacyPolicy(pathOrUrl: string): boolean {
  const normalized = pathOrUrl.toLowerCase();
  return (
    pathOrUrl.includes(HEALTH_CONNECT_RATIONALE_ACTION) ||
    normalized.includes("view_permission_usage") ||
    normalized.includes("android.intent.category.health_permissions") ||
    normalized.includes("health-permissions-rationale") ||
    normalized.includes("action_show_permissions_rationale") ||
    normalized.endsWith("/privacy") ||
    normalized.includes("://privacy")
  );
}

export function redirectHealthPrivacySystemPath(path: string): string {
  if (shouldOpenHealthPrivacyPolicy(path)) {
    return HEALTH_PRIVACY_PATH;
  }
  return path;
}
