import type { DuoScope } from "@/lib/social/duo/types";

export const DUO_SURFACE_DEFAULTS = {
  insights: "both",
  checklist: "me",
  calendar: "me",
} as const satisfies Record<string, DuoScope>;

export type DuoSurfaceName = keyof typeof DUO_SURFACE_DEFAULTS;

export function resolveDuoSurfaceDefault(
  pathname: string | null
): DuoScope {
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
