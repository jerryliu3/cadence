import type { DuoScope } from "@cadence/shared/social/duo";

export const DUO_SCOPE_COOKIE_NAME = "duo_scope";
const DUO_SCOPE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function parseDuoScopeCookieValue(value: string | null | undefined): DuoScope | null {
  if (value === "me" || value === "partner" || value === "both") {
    return value;
  }
  return null;
}

export function writeDuoScopeCookie(scope: DuoScope | null) {
  if (typeof document === "undefined") {
    return;
  }
  if (!scope) {
    document.cookie = `${DUO_SCOPE_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${DUO_SCOPE_COOKIE_NAME}=${encodeURIComponent(scope)}; Path=/; Max-Age=${DUO_SCOPE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
