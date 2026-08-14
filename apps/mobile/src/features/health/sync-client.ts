import AsyncStorage from "@react-native-async-storage/async-storage";
import { HEALTH_INGEST_BATCH_MAX } from "@cadence/shared/health/sync-window";
import { api } from "../../lib/api";
import type { HealthKitQuantityType } from "./ios-healthkit";
import { toIngestSample, utcOffsetMinutesFromInstant } from "./ingest-payload";
import { healthLocalDateFromOffset } from "@cadence/shared/health/local-date";
import type {
  HealthMetricKey,
  HealthProvider,
} from "@cadence/shared/health/providers";

const ANCHOR_KEY = "cadence.health.healthkit.anchors.v1";
const HEALTH_CONNECT_TOKEN_KEY = "cadence.health.healthconnect.changes-token.v1";
const AUTO_SYNC_KEY = "cadence.health.auto-sync.enabled.v1";

export async function loadHealthKitAnchors(): Promise<
  Partial<Record<HealthKitQuantityType, string>>
> {
  const raw = await AsyncStorage.getItem(ANCHOR_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Partial<Record<HealthKitQuantityType, string>>;
  } catch {
    return {};
  }
}

export async function saveHealthKitAnchors(
  anchors: Partial<Record<HealthKitQuantityType, string>>
) {
  await AsyncStorage.setItem(ANCHOR_KEY, JSON.stringify(anchors));
}

export async function loadHealthConnectChangesToken(): Promise<string | undefined> {
  const token = await AsyncStorage.getItem(HEALTH_CONNECT_TOKEN_KEY);
  return token || undefined;
}

export async function saveHealthConnectChangesToken(token: string) {
  await AsyncStorage.setItem(HEALTH_CONNECT_TOKEN_KEY, token);
}

export async function clearHealthConnectChangesToken() {
  await AsyncStorage.removeItem(HEALTH_CONNECT_TOKEN_KEY);
}

export async function clearHealthKitAnchors() {
  await AsyncStorage.removeItem(ANCHOR_KEY);
}

export async function isHealthAutoSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTO_SYNC_KEY)) === "1";
}

export async function setHealthAutoSyncEnabled(enabled: boolean) {
  if (enabled) {
    await AsyncStorage.setItem(AUTO_SYNC_KEY, "1");
    return;
  }
  await AsyncStorage.removeItem(AUTO_SYNC_KEY);
}

export function deviceLocalToday(now = new Date()): string {
  return healthLocalDateFromOffset(now, utcOffsetMinutesFromInstant(now));
}

export async function postHealthSamples(input: {
  provider: HealthProvider;
  permissionPrompted?: boolean;
  localToday?: string;
  lastError?: string | null;
  samples: ReturnType<typeof toIngestSample>[];
  deletedNativeIds?: string[];
}) {
  const { samples, deletedNativeIds, ...rest } = input;
  if (samples.length === 0) {
    return api.postJson("/api/health/samples", {
      ...rest,
      samples,
      deletedNativeIds,
    });
  }

  let last: unknown;
  for (let index = 0; index < samples.length; index += HEALTH_INGEST_BATCH_MAX) {
    const chunk = samples.slice(index, index + HEALTH_INGEST_BATCH_MAX);
    last = await api.postJson("/api/health/samples", {
      ...rest,
      samples: chunk,
      deletedNativeIds: index === 0 ? deletedNativeIds : undefined,
    });
  }
  return last;
}

export async function fetchHealthStatus() {
  return api.getJson<{
    providers: Array<{
      provider: HealthProvider;
      state: "never_asked" | "asked" | "receiving_data" | "stale";
      lastIngestAt: string | null;
      lastSampleAt: string | null;
      lastError: string | null;
    }>;
    autocompleteRules: Array<{
      id: string;
      goalId: string;
      metricKey: HealthMetricKey;
      thresholdNumeric: number;
      enabled: boolean;
    }>;
  }>("/api/health/status");
}

export async function disconnectHealthProvider(provider: HealthProvider) {
  await api.postJson("/api/health/disconnect", { provider });
  await setHealthAutoSyncEnabled(false);
  if (provider === "apple_healthkit") {
    await clearHealthKitAnchors();
  } else {
    await clearHealthConnectChangesToken();
  }
}

export async function upsertHealthAutocompleteRule(input: {
  goalId: string;
  metricKey: HealthMetricKey;
  thresholdNumeric: number;
  enabled?: boolean;
}) {
  return api.putJson("/api/health/autocomplete-rules", input);
}

export async function deleteHealthAutocompleteRule(id: string) {
  return api.deleteJson("/api/health/autocomplete-rules", { query: { id } });
}
