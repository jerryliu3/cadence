import {
  HEALTH_PROVIDERS,
  type HealthMetricKey,
  type HealthProvider,
  type HealthSyncEvidenceState,
} from "@cadence/shared/health/providers";
import { deriveHealthSyncState } from "@/lib/health/sync-state";

export interface HealthSyncStateRow {
  provider: HealthProvider;
  permission_prompted_at: string | null;
  last_ingest_at: string | null;
  last_sample_at: string | null;
  last_error: string | null;
}

export interface HealthAutocompleteRuleRow {
  id: string;
  goal_id: string;
  metric_key: HealthMetricKey;
  threshold_numeric: number | string;
  enabled: boolean;
}

export interface HealthProviderStatus {
  provider: HealthProvider;
  state: HealthSyncEvidenceState;
  lastIngestAt: string | null;
  lastSampleAt: string | null;
  lastError: string | null;
}

export interface HealthAutocompleteRuleStatus {
  id: string;
  goalId: string;
  metricKey: HealthMetricKey;
  thresholdNumeric: number;
  enabled: boolean;
}

export function toHealthProviderStatuses(
  rows: HealthSyncStateRow[],
  now?: number
): HealthProviderStatus[] {
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  return HEALTH_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    return {
      provider,
      state: deriveHealthSyncState({
        permissionPromptedAt: row?.permission_prompted_at ?? null,
        lastSampleAt: row?.last_sample_at ?? null,
        now,
      }),
      lastIngestAt: row?.last_ingest_at ?? null,
      lastSampleAt: row?.last_sample_at ?? null,
      lastError: row?.last_error ?? null,
    };
  });
}

export function toHealthAutocompleteRuleStatuses(
  rows: HealthAutocompleteRuleRow[]
): HealthAutocompleteRuleStatus[] {
  return rows.map((row) => ({
    id: row.id,
    goalId: row.goal_id,
    metricKey: row.metric_key,
    thresholdNumeric: Number(row.threshold_numeric),
    enabled: row.enabled,
  }));
}
