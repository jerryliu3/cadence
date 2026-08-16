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
   * Default: off until poster/video path is validated.
   */
  journeyEnabled: boolean;
  /**
   * Enables cinematic journey video layer.
   * Default: off until assets are available.
   */
  journeyVideoEnabled: boolean;
  /**
   * Enables journey Rive overlay runtime.
   * Default: off until native/web runtime wiring is complete.
   */
  journeyRiveEnabled: boolean;
  /**
   * Enables partner/team overlay markers for social scope.
   * Default: off while social overlay behavior is hardened.
   */
  journeySocialOverlayEnabled: boolean;
  /**
   * Asset manifest version pin for controlled rollout and rollback.
   * Default: "v1".
   */
  journeyAssetManifestVersion: string;
}
