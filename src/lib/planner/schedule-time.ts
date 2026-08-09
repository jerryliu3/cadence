import { z } from "zod";

const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:00$/;

export const plannerLocalTimeSchema = z.string().regex(localTimePattern);

function isValidPlannerLocalDateTime(value: string) {
  if (!localDateTimePattern.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour &&
    parsed.getUTCMinutes() === minute &&
    parsed.getUTCSeconds() === 0
  );
}

export const plannerLocalDateTimeSchema = z
  .string()
  .regex(localDateTimePattern)
  .refine(isValidPlannerLocalDateTime, "Invalid planner local date-time.");

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
  goalDefaultLocalTime,
  normalizedGoalDefaultLocalTime,
  scheduledTimeOverride,
}: {
  scheduledDate: string | null;
  goalDefaultLocalTime?: string | null | undefined;
  normalizedGoalDefaultLocalTime?: string | null | undefined;
  scheduledTimeOverride: string | null | undefined;
}) {
  const normalizedGoalDefault =
    normalizedGoalDefaultLocalTime ??
    normalizePlannerLocalTime(goalDefaultLocalTime);
  const normalizedOverride = normalizePlannerLocalTime(scheduledTimeOverride);
  const effectiveScheduledLocalTime = normalizedOverride ?? normalizedGoalDefault;
  const effectiveScheduledAtLocal =
    scheduledDate && effectiveScheduledLocalTime
      ? `${scheduledDate}T${effectiveScheduledLocalTime}:00`
      : null;
  if (effectiveScheduledAtLocal) {
    plannerLocalDateTimeSchema.parse(effectiveScheduledAtLocal);
  }
  return {
    goalDefaultLocalTime: normalizedGoalDefault,
    scheduledTimeOverride: normalizedOverride,
    effectiveScheduledLocalTime,
    effectiveScheduledAtLocal,
  };
}
