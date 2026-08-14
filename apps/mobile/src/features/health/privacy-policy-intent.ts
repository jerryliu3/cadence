export const HEALTH_CONNECT_RATIONALE_ACTION =
  "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE";

export const HEALTH_PRIVACY_PATH = "/privacy";

export function shouldOpenHealthPrivacyPolicy(url: string): boolean {
  const normalized = url.toLowerCase();
  return (
    url.includes(HEALTH_CONNECT_RATIONALE_ACTION) ||
    normalized.includes("view_permission_usage") ||
    normalized.includes("health-permissions-rationale") ||
    normalized.endsWith("/privacy") ||
    normalized.includes("://privacy")
  );
}
