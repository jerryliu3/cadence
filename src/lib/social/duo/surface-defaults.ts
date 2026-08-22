import {
  DUO_SURFACE_DEFAULTS,
  type DuoScope,
} from "@cadence/shared/social/duo";

export { DUO_SURFACE_DEFAULTS };

// Keep these route prefixes synchronized with DUO_SURFACE_DEFAULTS in the
// shared package whenever a Duo surface is added or renamed.
export function resolveDuoSurfaceDefault(pathname: string | null): DuoScope {
  if (
    pathname?.startsWith("/insights") ||
    pathname?.startsWith("/app/insights")
  ) {
    return DUO_SURFACE_DEFAULTS.insights;
  }
  if (
    pathname?.startsWith("/checklist") ||
    pathname?.startsWith("/app/checklist")
  ) {
    return DUO_SURFACE_DEFAULTS.checklist;
  }
  if (
    pathname?.startsWith("/calendar") ||
    pathname?.startsWith("/app/calendar")
  ) {
    return DUO_SURFACE_DEFAULTS.calendar;
  }
  return DUO_SURFACE_DEFAULTS.checklist;
}
