export const HEALTH_UTC_OFFSET_MINUTES_MIN = -840;
export const HEALTH_UTC_OFFSET_MINUTES_MAX = 840;
export const HEALTH_INGEST_BATCH_MAX = 500;
/** Inclusive days behind local today for ingest keep + autocomplete (1 = today and yesterday). */
export const HEALTH_SYNC_LOOKBACK_DAYS = 1;
/** Native query padding so timezone edges are not missed before client filtering. */
export const HEALTH_NATIVE_QUERY_LOOKBACK_DAYS = 3;
const UTC_OFFSET_ENVELOPE_HOURS = 14;

export function addUtcDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) {
    throw new Error("invalid iso date");
  }
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

export function healthUtcOffsetEnvelope(now = new Date()): {
  min: string;
  max: string;
} {
  const min = new Date(
    now.getTime() - UTC_OFFSET_ENVELOPE_HOURS * 3_600_000
  )
    .toISOString()
    .slice(0, 10);
  const max = new Date(
    now.getTime() + UTC_OFFSET_ENVELOPE_HOURS * 3_600_000
  )
    .toISOString()
    .slice(0, 10);
  return { min, max };
}

export function isHealthLocalTodayInEnvelope(
  localToday: string,
  now = new Date()
): boolean {
  const { min, max } = healthUtcOffsetEnvelope(now);
  return localToday >= min && localToday <= max;
}

export function isHealthLocalDateInLookback(
  localDate: string,
  localToday: string,
  lookbackDays = HEALTH_SYNC_LOOKBACK_DAYS
): boolean {
  return (
    localDate <= localToday &&
    localDate >= addUtcDays(localToday, -lookbackDays)
  );
}

export function healthNativeQueryRange(now = new Date()): {
  start: Date;
  end: Date;
} {
  return {
    start: new Date(
      now.getTime() - HEALTH_NATIVE_QUERY_LOOKBACK_DAYS * 86_400_000
    ),
    end: new Date(now.getTime() + 86_400_000),
  };
}
