import { getServerEnv } from "@/lib/env";
import type { FeatureFlags } from "@cadence/shared/feature-flags";

export type { FeatureFlags } from "@cadence/shared/feature-flags";

type BooleanFeatureFlagKey = {
  [K in keyof FeatureFlags]: FeatureFlags[K] extends boolean ? K : never;
}[keyof FeatureFlags];

/**
 * Server-side feature flags for uncertain launches.
 *
 * Defaults are conservative: ship dark, enable for yourself first, then widen.
 * Remove flags once a cutover is complete (see AGENTS.md).
 */

export function getFeatureFlags(): FeatureFlags {
  const env = getServerEnv();
  return {
    crossMonthMovesEnabled: env.FEATURE_CROSS_MONTH_MOVES,
    xpEnabled: env.XP_ENABLED,
    socialEnabled: env.SOCIAL_ENABLED,
    integrationsEnabled: env.INTEGRATIONS_ENABLED,
    journeyEnabled: env.JOURNEY_ENABLED,
  };
}

export function isFeatureEnabled<K extends BooleanFeatureFlagKey>(
  flag: K
): boolean {
  return getFeatureFlags()[flag];
}
