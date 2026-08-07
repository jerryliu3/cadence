import { z } from "zod";

const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:00$/;

export const plannerLocalTimeSchema = z.string().regex(localTimePattern);
export const plannerLocalDateTimeSchema = z.string().regex(localDateTimePattern);

export function normalizePlannerLocalTime(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return plannerLocalTimeSchema.parse(trimmed);
}

export function resolvePlannerEffectiveScheduledTime({
  scheduledDate,
  scheduledTimeOverride,
}: {
  scheduledDate: string | null;
  scheduledTimeOverride: string | null | undefined;
}) {
  const normalizedOverride = normalizePlannerLocalTime(scheduledTimeOverride);
  const effectiveScheduledLocalTime = normalizedOverride;
  const effectiveScheduledAtLocal =
    scheduledDate && effectiveScheduledLocalTime
      ? `${scheduledDate}T${effectiveScheduledLocalTime}:00`
      : null;
  if (effectiveScheduledAtLocal) {
    plannerLocalDateTimeSchema.parse(effectiveScheduledAtLocal);
  }
  return {
    scheduledTimeOverride: normalizedOverride,
    effectiveScheduledLocalTime,
    effectiveScheduledAtLocal,
  };
}
