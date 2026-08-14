import {
  DUO_SURFACE_DEFAULTS,
  type DuoScope,
  type DuoSurfaceName,
} from "@cadence/shared/social/duo";

export { DUO_SURFACE_DEFAULTS };
export type { DuoSurfaceName };

export function resolveDuoSurfaceDefault(pathname: string | null): DuoScope {
  if (pathname?.startsWith("/insights")) {
    return DUO_SURFACE_DEFAULTS.insights;
  }
  if (pathname?.startsWith("/checklist")) {
    return DUO_SURFACE_DEFAULTS.checklist;
  }
  if (pathname?.startsWith("/calendar")) {
    return DUO_SURFACE_DEFAULTS.calendar;
  }
  return DUO_SURFACE_DEFAULTS.checklist;
}
