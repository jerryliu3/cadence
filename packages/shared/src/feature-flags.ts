export interface FeatureFlags {
  /**
   * Cross-month drag/move persistence (kernel ordinal allocation).
   * Default: off until the feature is ready for dark launch.
   */
  crossMonthMovesEnabled: boolean;
  /**
   * XP profile and awards API availability.
   * Default: off until XP rollout is explicitly enabled.
   */
  xpEnabled: boolean;
  /**
   * Social surfaces (feed, challenges, leaderboards, duo) and social APIs.
   * Default: off until social rollout is explicitly enabled.
   */
  socialEnabled: boolean;
  /**
   * Health integrations (HealthKit / Health Connect ingest APIs).
   * Default: off until Wave 1 device gates pass.
   */
  integrationsEnabled: boolean;
  /**
   * Mountain journey visual system entry flag.
   * Default: off until journey background rollout is validated.
   */
  journeyEnabled: boolean;
}
