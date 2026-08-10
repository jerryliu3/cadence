import { getServerEnv } from "@/lib/env";

/**
 * Server-side feature flags / kill switches.
 *
 * Flags are env-backed booleans validated by `src/lib/env.ts`.
 * Defaults are intentionally conservative for uncertain launches:
 * ship dark, enable for yourself first, then widen.
 *
 * Remove flags once a cutover is complete (see AGENTS.md).
 */
export interface FeatureFlags {
  /** Global planner/calendar surface gate. Default: on. */
  calendarEnabled: boolean;
  /**
   * Cross-month drag/move persistence (kernel ordinal allocation).
   * Default: off until the feature is ready for dark launch.
   */
  crossMonthMovesEnabled: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  const env = getServerEnv();
  return {
    calendarEnabled: env.CALENDAR_ENABLED,
    crossMonthMovesEnabled: env.FEATURE_CROSS_MONTH_MOVES,
  };
}

export function isFeatureEnabled<K extends keyof FeatureFlags>(flag: K): boolean {
  return getFeatureFlags()[flag];
}
