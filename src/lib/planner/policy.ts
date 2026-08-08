import { z } from "zod";
import { isValidIanaTimezone } from "@/lib/dates/timezone";
import { compareCanonicalStrings } from "@/lib/planner/canonical";
import {
  dateIsInWindow,
  getUtcWeekday,
  type DateWindow,
} from "@/lib/planner/dates";
import {
  MAX_POLICY_RANGES,
  POLICY_COMPILER_VERSION,
  POLICY_SCHEMA_VERSION,
} from "@/lib/planner/contracts/bounds";

const weekdaySchema = z.number().int().min(0).max(6);
const dateSchema = z.iso.date();
const dateWindowSchema = z
  .object({
    start: dateSchema,
    end: dateSchema,
  })
  .strict()
  .refine((window) => window.start <= window.end, "Invalid date range.");

export const plannerPolicySchema = z
  .object({
    schemaVersion: z.literal(POLICY_SCHEMA_VERSION),
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine(isValidIanaTimezone, "Invalid IANA timezone."),
    timezoneConfirmedAt: z.string().datetime({ offset: true }),
    weekStartsOn: weekdaySchema.optional(),
    restWeekdays: z.array(weekdaySchema).max(7),
    blackoutRanges: z.array(dateWindowSchema).max(MAX_POLICY_RANGES),
  })
  .strip();

export type PlannerPolicy = z.infer<typeof plannerPolicySchema>;

export interface CompiledPolicy {
  compilerVersion: typeof POLICY_COMPILER_VERSION;
  policy: PlannerPolicy;
}

export function createDefaultPlannerPolicy(
  timezone: string,
  timezoneConfirmedAt: string
): PlannerPolicy {
  return plannerPolicySchema.parse({
    schemaVersion: POLICY_SCHEMA_VERSION,
    timezone,
    timezoneConfirmedAt,
    weekStartsOn: 1,
    restWeekdays: [],
    blackoutRanges: [],
  });
}

export function compilePlannerPolicy(policy: PlannerPolicy): CompiledPolicy {
  const parsedPolicy = plannerPolicySchema.parse(policy);
  const normalizeWeekdays = (weekdays: number[]) =>
    Array.from(new Set(weekdays)).sort((left, right) => left - right);
  const normalizeWeekStartsOn = (weekStartsOn: number | undefined) =>
    weekStartsOn !== undefined && weekStartsOn >= 0 && weekStartsOn <= 6
      ? weekStartsOn
      : 1;
  const normalizedPolicy: PlannerPolicy = {
    ...parsedPolicy,
    weekStartsOn: normalizeWeekStartsOn(parsedPolicy.weekStartsOn),
    restWeekdays: normalizeWeekdays(parsedPolicy.restWeekdays),
    blackoutRanges: [...parsedPolicy.blackoutRanges]
      .sort((left, right) => {
        const byStart = compareCanonicalStrings(left.start, right.start);
        return byStart !== 0
          ? byStart
          : compareCanonicalStrings(left.end, right.end);
      })
      .filter(
        (range, index, ranges) =>
          index === 0 ||
          range.start !== ranges[index - 1].start ||
          range.end !== ranges[index - 1].end
      ),
  };
  return {
    compilerVersion: POLICY_COMPILER_VERSION,
    policy: normalizedPolicy,
  };
}

export function getCompiledDateCost(
  compiled: CompiledPolicy,
  date: string,
  restEligible = true
) {
  const { policy } = compiled;
  const weekday = getUtcWeekday(date);
  const advisoryPenalty =
    (policy.blackoutRanges.some((range) =>
      dateIsInWindow(date, range as DateWindow)
    )
      ? 10
      : 0) +
    (restEligible && policy.restWeekdays.includes(weekday) ? 6 : 0);

  return advisoryPenalty;
}
