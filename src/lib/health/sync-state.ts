import type { HealthSyncEvidenceState } from "@cadence/shared/health/providers";

export const HEALTH_RECEIVING_DATA_WINDOW_MS = 36 * 60 * 60 * 1000;

export function deriveHealthSyncState({
  permissionPromptedAt,
  lastSampleAt,
  now = Date.now(),
}: {
  permissionPromptedAt: string | null;
  lastSampleAt: string | null;
  now?: number;
}): HealthSyncEvidenceState {
  if (lastSampleAt) {
    const sampledAt = Date.parse(lastSampleAt);
    if (
      Number.isFinite(sampledAt) &&
      now - sampledAt <= HEALTH_RECEIVING_DATA_WINDOW_MS
    ) {
      return "receiving_data";
    }
    return "stale";
  }

  if (permissionPromptedAt) {
    return "asked";
  }

  return "never_asked";
}
