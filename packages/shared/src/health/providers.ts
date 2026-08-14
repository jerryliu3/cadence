export const HEALTH_PROVIDERS = [
  "apple_healthkit",
  "android_health_connect",
] as const;

export const HEALTH_METRIC_KEYS = [
  "steps",
  "active_energy_kcal",
  "distance_meters",
  "exercise_minutes",
  "sleep_asleep_minutes",
  "workout_duration_minutes",
] as const;

export const HEALTH_SYNC_STATES = [
  "never_asked",
  "asked",
  "receiving_data",
  "stale",
] as const;

export type HealthProvider = (typeof HEALTH_PROVIDERS)[number];
export type HealthMetricKey = (typeof HEALTH_METRIC_KEYS)[number];
export type HealthSyncEvidenceState = (typeof HEALTH_SYNC_STATES)[number];
