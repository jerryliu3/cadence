import type { DuoScope } from "@/lib/social/duo/types";

export const DUO_SURFACE_DEFAULTS = {
  insights: "both",
  checklist: "me",
  calendar: "me",
} as const satisfies Record<string, DuoScope>;

/**
 * Route-based lookup for DuoScopeToggle, which renders above the surfaces and
 * so cannot read their `useDuoSurface(...)` argument.
 *
 * The prefixes here must stay in step with DUO_SURFACE_DEFAULTS above and with
 * the surface name each shell passes to useDuoSurface. Registering the default
 * with the provider would remove the duplication, but costs more code than it
 * saves for three routes.
 */
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
