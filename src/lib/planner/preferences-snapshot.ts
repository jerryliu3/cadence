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
    policy_revision: z.number().int().min(1).optional(),
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
  return null;
}

function normalizeWeekdays(days: number[] | null | undefined) {
  return Array.from(new Set(days ?? [])).sort((left, right) => left - right);
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
  const timezoneConfirmedAt = normalizeConfirmedAt(
    profile?.timezone_confirmed_at ?? legacy?.timezone_confirmed_at
  );
  if (!timezone || !timezoneConfirmedAt) {
    return null;
  }
  const basePolicy = createDefaultPlannerPolicy(timezone, timezoneConfirmedAt);

  const mergedPolicyInput = {
    ...basePolicy,
    timezone,
    timezoneConfirmedAt,
    weekStartsOn: profile?.week_starts_on ?? basePolicy.weekStartsOn ?? 1,
    restWeekdays:
      profile?.rest_weekdays !== undefined && profile?.rest_weekdays !== null
        ? normalizeWeekdays(profile.rest_weekdays)
        : normalizeWeekdays(basePolicy.restWeekdays),
    blackoutRanges:
      profile?.blackout_ranges !== undefined && profile?.blackout_ranges !== null
        ? profile.blackout_ranges
        : basePolicy.blackoutRanges ?? [],
  };

  const policyRevision = legacy?.policy_revision;
  return {
    timezone,
    timezone_confirmed_at: timezoneConfirmedAt,
    policy_revision: policyRevision && policyRevision >= 1 ? policyRevision : 1,
    default_policy: plannerPolicySchema.parse(mergedPolicyInput),
  };
}
