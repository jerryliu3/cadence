const MIN_UTC_OFFSET_MINUTES = -840;
const MAX_UTC_OFFSET_MINUTES = 840;

export function healthLocalDateFromOffset(
  startedAt: Date | string,
  utcOffsetMinutes: number
): string {
  if (
    !Number.isInteger(utcOffsetMinutes) ||
    utcOffsetMinutes < MIN_UTC_OFFSET_MINUTES ||
    utcOffsetMinutes > MAX_UTC_OFFSET_MINUTES
  ) {
    throw new Error("utc_offset_minutes out of range");
  }

  const startedMs =
    typeof startedAt === "string" ? Date.parse(startedAt) : startedAt.getTime();
  if (!Number.isFinite(startedMs)) {
    throw new Error("invalid started_at");
  }

  return new Date(startedMs + utcOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}
