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

export const HEALTH_PROVIDER_LABELS: Record<HealthProvider, string> = {
  apple_healthkit: "Apple Health",
  android_health_connect: "Health Connect",
};

export const HEALTH_METRIC_LABELS: Record<HealthMetricKey, string> = {
  steps: "Steps",
  active_energy_kcal: "Active energy",
  distance_meters: "Distance",
  exercise_minutes: "Exercise minutes",
  sleep_asleep_minutes: "Sleep",
  workout_duration_minutes: "Workouts",
};

export const HEALTH_SYNC_STATE_COPY: Record<
  HealthSyncEvidenceState,
  { title: string; detail: string }
> = {
  never_asked: {
    title: "Not connected",
    detail: "Cadence has not asked for this provider yet.",
  },
  asked: {
    title: "Waiting for data",
    detail: "Permission was requested, but no samples have arrived yet.",
  },
  receiving_data: {
    title: "Receiving data",
    detail: "Samples arrived within the last 36 hours.",
  },
  stale: {
    title: "Sync is stale",
    detail: "The last sample is older than 36 hours. Try a manual resync.",
  },
};

export const HEALTH_DISCONNECT_COPY =
  "Disconnecting deletes Cadence copies of this provider's samples and re-runs canonical election. Device permissions stay until you revoke them in Apple Health or Health Connect, then restart the app.";
