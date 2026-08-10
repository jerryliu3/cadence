import { getServerEnv } from "@/lib/env";

/**
 * Server-side feature flags for uncertain launches.
 *
 * Defaults are conservative: ship dark, enable for yourself first, then widen.
 * Remove flags once a cutover is complete (see AGENTS.md).
 */
export interface FeatureFlags {
  /**
   * Cross-month drag/move persistence (kernel ordinal allocation).
   * Default: off until the feature is ready for dark launch.
   */
  crossMonthMovesEnabled: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  const env = getServerEnv();
  return {
    crossMonthMovesEnabled: env.FEATURE_CROSS_MONTH_MOVES,
  };
}

export function isFeatureEnabled<K extends keyof FeatureFlags>(flag: K): boolean {
  return getFeatureFlags()[flag];
}
