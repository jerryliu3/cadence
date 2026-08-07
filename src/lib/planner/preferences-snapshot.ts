import { z } from "zod";
import {
  createDefaultPlannerPolicy,
  plannerPolicySchema,
  type PlannerPolicy,
} from "@/lib/planner/policy";

const profileBlackoutRangeSchema = z
  .object({
    start: z.iso.date(),
    end: z.iso.date(),
  })
  .strict()
  .refine((range) => range.start <= range.end, "Invalid blackout range.");

const plannerProfilePreferencesRowSchema = z
  .object({
    timezone: z.string().trim().min(1).max(100),
    timezone_confirmed_at: z.string().datetime({ offset: true }).nullable().optional(),
    week_starts_on: z.number().int().min(0).max(6).nullable().optional(),
    rest_weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
    blackout_ranges: z.array(profileBlackoutRangeSchema).nullable().optional(),
  })
  .strict();

const plannerLegacyPreferencesRowSchema = z
  .object({
    timezone: z.string().trim().min(1).max(100),
    timezone_confirmed_at: z.string().datetime({ offset: true }).nullable().optional(),
    policy_revision: z.number().int().nonnegative().optional(),
    default_policy: z.unknown(),
  })
  .strict();

export type PlannerProfilePreferencesRow = z.infer<
  typeof plannerProfilePreferencesRowSchema
>;
export type PlannerLegacyPreferencesRow = z.infer<
  typeof plannerLegacyPreferencesRowSchema
>;

export interface PlannerPreferencesSnapshot {
  timezone: string;
  timezone_confirmed_at: string;
  policy_revision: number;
  default_policy: PlannerPolicy;
}

function normalizeConfirmedAt(value: string | null | undefined) {
  if (value && Number.isFinite(Date.parse(value))) {
    return value;
  }
  return new Date().toISOString();
}

function normalizeWeekdays(days: number[] | null | undefined) {
  return Array.from(new Set(days ?? [])).sort((left, right) => left - right);
}

function buildPolicyFromProfile({
  timezone,
  timezoneConfirmedAt,
  weekStartsOn,
  restWeekdays,
  blackoutRanges,
}: {
  timezone: string;
  timezoneConfirmedAt: string;
  weekStartsOn: number | null | undefined;
  restWeekdays: number[] | null | undefined;
  blackoutRanges:
    | Array<{ start: string; end: string }>
    | null
    | undefined;
}) {
  const policy = createDefaultPlannerPolicy(timezone, timezoneConfirmedAt);
  policy.weekStartsOn = weekStartsOn ?? 1;
  policy.restWeekdays = normalizeWeekdays(restWeekdays);
  policy.blackoutRanges = blackoutRanges ?? [];
  return plannerPolicySchema.parse(policy);
}

function parseLegacyPolicy(
  policy: unknown,
  timezone: string,
  timezoneConfirmedAt: string
) {
  const parsed = plannerPolicySchema.safeParse(policy);
  if (!parsed.success) {
    return null;
  }
  return plannerPolicySchema.parse({
    ...parsed.data,
    timezone,
    timezoneConfirmedAt,
  });
}

export function parsePlannerProfilePreferencesRow(raw: unknown) {
  return plannerProfilePreferencesRowSchema.parse(raw);
}

export function parsePlannerLegacyPreferencesRow(raw: unknown) {
  return plannerLegacyPreferencesRowSchema.parse(raw);
}

export function resolvePlannerPreferencesSnapshot({
  profile,
  legacy,
}: {
  profile: PlannerProfilePreferencesRow | null;
  legacy: PlannerLegacyPreferencesRow | null;
}): PlannerPreferencesSnapshot | null {
  const timezone = profile?.timezone ?? legacy?.timezone ?? null;
  if (!timezone) {
    return null;
  }
  const timezoneConfirmedAt = normalizeConfirmedAt(
    profile?.timezone_confirmed_at ?? legacy?.timezone_confirmed_at
  );
  const profilePolicy = profile
    ? buildPolicyFromProfile({
        timezone,
        timezoneConfirmedAt,
        weekStartsOn: profile.week_starts_on,
        restWeekdays: profile.rest_weekdays,
        blackoutRanges: profile.blackout_ranges,
      })
    : null;
  const legacyPolicy = legacy
    ? parseLegacyPolicy(legacy.default_policy, timezone, timezoneConfirmedAt)
    : null;

  const mergedPolicyInput = {
    ...(legacyPolicy ?? profilePolicy ?? createDefaultPlannerPolicy(timezone, timezoneConfirmedAt)),
    timezone,
    timezoneConfirmedAt,
    weekStartsOn: profile?.week_starts_on ?? legacyPolicy?.weekStartsOn ?? 1,
    restWeekdays:
      profile?.rest_weekdays !== undefined && profile?.rest_weekdays !== null
        ? normalizeWeekdays(profile.rest_weekdays)
        : normalizeWeekdays(legacyPolicy?.restWeekdays),
    blackoutRanges:
      profile?.blackout_ranges !== undefined && profile?.blackout_ranges !== null
        ? profile.blackout_ranges
        : legacyPolicy?.blackoutRanges ?? [],
  };

  return {
    timezone,
    timezone_confirmed_at: timezoneConfirmedAt,
    policy_revision: legacy?.policy_revision ?? 0,
    default_policy: plannerPolicySchema.parse(mergedPolicyInput),
  };
}
