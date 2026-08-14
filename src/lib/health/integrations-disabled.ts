import { isFeatureEnabled } from "@/lib/feature-flags";
import { ApiRouteError } from "@/lib/api/route";
import { getServerEnv } from "@/lib/env";

export function integrationsDisabledError() {
  return new ApiRouteError(
    503,
    "integrations_disabled",
    "Integrations are not enabled."
  );
}

export function parseIntegrationsAllowlist(raw?: string | null): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function isIntegrationsEnabledForUser(
  userId: string,
  {
    enabled = isFeatureEnabled("integrationsEnabled"),
    allowlist = parseIntegrationsAllowlist(
      getServerEnv().INTEGRATIONS_ALLOWED_USER_IDS
    ),
  }: {
    enabled?: boolean;
    allowlist?: string[];
  } = {}
): boolean {
  if (!enabled) {
    return false;
  }
  if (allowlist.length === 0) {
    return true;
  }
  return allowlist.includes(userId);
}

export function requireIntegrationsFlag() {
  if (!isFeatureEnabled("integrationsEnabled")) {
    throw integrationsDisabledError();
  }
}

export function requireIntegrationsAccess(userId: string) {
  requireIntegrationsFlag();
  if (!isIntegrationsEnabledForUser(userId)) {
    throw integrationsDisabledError();
  }
}
