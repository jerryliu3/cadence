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
const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((month) => {
    const monthNumber = Number(month.slice(5, 7));
    return monthNumber >= 1 && monthNumber <= 12;
  }, "Invalid calendar month.");
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
    goalAllowedWeekdays: z.record(
      z.string().min(1).max(100),
      z.array(weekdaySchema).min(1).max(7)
    ),
    datePreferences: z
      .array(
        z
          .object({
            goalId: z.string().min(1).max(100).nullable(),
            start: dateSchema,
            end: dateSchema,
            effect: z.enum(["avoid", "prefer"]),
          })
          .strict()
          .refine(
            (preference) => preference.start <= preference.end,
            "Invalid preference range."
          )
      )
      .max(MAX_POLICY_RANGES),
    spacingStrategy: z.enum(["front_load", "even", "flexible"]),
    goalSpacingStrategies: z.record(
      z.string().min(1).max(100),
      z.enum(["front_load", "even", "flexible"])
    ),
    goalMonthlyDistributions: z
      .record(
        z.string().min(1).max(100),
        z.array(
          z
            .object({
              month: monthSchema,
              count: z.number().int().nonnegative(),
            })
            .strict()
        )
      )
      .optional(),
    dailyCadenceRestExemption: z.literal(true),
  })
  .strict();

export type PlannerPolicy = z.infer<typeof plannerPolicySchema>;
export type SpacingStrategy = PlannerPolicy["spacingStrategy"];

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
    goalAllowedWeekdays: {},
    datePreferences: [],
    spacingStrategy: "flexible",
    goalSpacingStrategies: {},
    goalMonthlyDistributions: {},
    dailyCadenceRestExemption: true,
  });
}

export function compilePlannerPolicy(policy: PlannerPolicy): CompiledPolicy {
  const parsed = plannerPolicySchema.parse(policy);
  const normalizeWeekdays = (weekdays: number[]) =>
    Array.from(new Set(weekdays)).sort((left, right) => left - right);
  const normalizeWeekStartsOn = (weekStartsOn: number | undefined) =>
    weekStartsOn !== undefined && weekStartsOn >= 0 && weekStartsOn <= 6
      ? weekStartsOn
      : 1;
  const normalizeGoalMonthlyDistribution = (
    distribution: Array<{ month: string; count: number }>
  ) => {
    const countByMonth = new Map<string, number>();
    for (const entry of distribution) {
      if (entry.count <= 0) {
        continue;
      }
      countByMonth.set(
        entry.month,
        (countByMonth.get(entry.month) ?? 0) + entry.count
      );
    }
    return Array.from(countByMonth.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((left, right) => compareCanonicalStrings(left.month, right.month));
  };
  return {
    compilerVersion: POLICY_COMPILER_VERSION,
    policy: {
      ...parsed,
      weekStartsOn: normalizeWeekStartsOn(parsed.weekStartsOn),
      restWeekdays: normalizeWeekdays(parsed.restWeekdays),
      blackoutRanges: [...parsed.blackoutRanges]
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
      goalAllowedWeekdays: Object.fromEntries(
        Object.entries(parsed.goalAllowedWeekdays)
          .sort(([left], [right]) =>
            compareCanonicalStrings(left, right)
          )
          .map(([goalId, weekdays]) => [
            goalId,
            normalizeWeekdays(weekdays),
          ])
      ),
      goalMonthlyDistributions: Object.fromEntries(
        Object.entries(parsed.goalMonthlyDistributions ?? {})
          .sort(([left], [right]) => compareCanonicalStrings(left, right))
          .map(([goalId, distribution]) => [
            goalId,
            normalizeGoalMonthlyDistribution(distribution),
          ])
          .filter(([, distribution]) => distribution.length > 0)
      ),
      datePreferences: [...parsed.datePreferences]
        .sort((left, right) => {
          const leftGoal = left.goalId ?? "";
          const rightGoal = right.goalId ?? "";
          const byGoal = compareCanonicalStrings(leftGoal, rightGoal);
          if (byGoal !== 0) return byGoal;
          const byStart = compareCanonicalStrings(left.start, right.start);
          if (byStart !== 0) return byStart;
          const byEnd = compareCanonicalStrings(left.end, right.end);
          return byEnd !== 0
            ? byEnd
            : compareCanonicalStrings(left.effect, right.effect);
        })
        .filter(
          (preference, index, preferences) =>
            index === 0 ||
            preference.goalId !== preferences[index - 1].goalId ||
            preference.start !== preferences[index - 1].start ||
            preference.end !== preferences[index - 1].end ||
            preference.effect !== preferences[index - 1].effect
        ),
    },
  };
}

export function isDateAllowedByPolicy(
  compiled: CompiledPolicy,
  goalId: string,
  date: string,
  restEligible: boolean
) {
  const { policy } = compiled;
  if (
    policy.blackoutRanges.some((range) =>
      dateIsInWindow(date, range as DateWindow)
    )
  ) {
    return false;
  }

  const weekday = getUtcWeekday(date);
  if (restEligible && policy.restWeekdays.includes(weekday)) {
    return false;
  }

  const allowedWeekdays = policy.goalAllowedWeekdays[goalId];
  return !allowedWeekdays || allowedWeekdays.includes(weekday);
}

export function getCompiledDateCost(
  compiled: CompiledPolicy,
  goalId: string,
  date: string
) {
  return compiled.policy.datePreferences.reduce((cost, preference) => {
    if (
      preference.goalId !== null &&
      preference.goalId !== goalId
    ) {
      return cost;
    }
    if (date < preference.start || date > preference.end) {
      return cost;
    }
    return cost + (preference.effect === "avoid" ? 8 : -3);
  }, 0);
}

export function getSpacingStrategy(
  compiled: CompiledPolicy,
  goalId: string
): SpacingStrategy {
  return (
    compiled.policy.goalSpacingStrategies[goalId] ??
    compiled.policy.spacingStrategy
  );
}

export function getSpacingIdealDate(
  strategy: SpacingStrategy,
  unitIndex: number,
  unitCount: number,
  candidateDates: string[]
) {
  if (strategy === "flexible" || candidateDates.length === 0) {
    return null;
  }
  if (strategy === "front_load") {
    return candidateDates[Math.min(unitIndex, candidateDates.length - 1)];
  }
  if (unitCount <= 1) {
    return candidateDates[Math.floor((candidateDates.length - 1) / 2)];
  }
  const idealIndex = Math.round(
    (unitIndex * (candidateDates.length - 1)) / (unitCount - 1)
  );
  return candidateDates[idealIndex];
}
