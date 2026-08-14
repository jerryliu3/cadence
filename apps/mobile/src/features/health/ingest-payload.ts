import type { HealthMetricKey } from "@cadence/shared/health/providers";
import { healthLocalDateFromOffset } from "@cadence/shared/health/local-date";

export interface NormalizedHealthSample {
  providerNativeId: string;
  sourceIdentifier: string;
  sourceName?: string;
  metricKey: HealthMetricKey;
  startedAt: string;
  endedAt?: string;
  utcOffsetMinutes: number;
  valueNumeric: number;
  unit: string;
}

export function utcOffsetMinutesFromInstant(startedAt: Date): number {
  return -startedAt.getTimezoneOffset();
}

export function toIngestSample(sample: NormalizedHealthSample) {
  return {
    providerNativeId: sample.providerNativeId,
    sourceIdentifier: sample.sourceIdentifier,
    sourceName: sample.sourceName,
    metricKey: sample.metricKey,
    startedAt: sample.startedAt,
    endedAt: sample.endedAt,
    utcOffsetMinutes: sample.utcOffsetMinutes,
    valueNumeric: sample.valueNumeric,
    unit: sample.unit,
  };
}

export function localDateForSample(sample: NormalizedHealthSample): string {
  return healthLocalDateFromOffset(sample.startedAt, sample.utcOffsetMinutes);
}
