import { z } from "zod";
import { goalAssessmentSchema } from "@/lib/planner/assessment";
import {
  MAX_HORIZON_MONTHS,
  MAX_PLANNER_WINDOW_DAYS,
  PLANNER_CONTRACT_VERSION,
  PLANNER_ELIGIBILITY_MODES,
  REQUIREMENT_SCHEMA_VERSION,
} from "@/lib/planner/contracts/bounds";
import { plannerPolicySchema } from "@/lib/planner/policy";
import {
  plannerLocalDateTimeSchema,
  plannerLocalTimeSchema,
} from "@/lib/planner/schedule-time";
import { countDateWindowDays, isMonthAlignedPlannerWindow } from "@/lib/planner/dates";

const dateSchema = z.iso.date();
const nullableDateSchema = dateSchema.nullable();
const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((month) => {
    const value = Number(month.slice(5, 7));
    return value >= 1 && value <= 12;
  }, "Invalid calendar month.");
const issueCodeSchema = z.enum([
  "placement_shortfall",
  "invalid_lock",
  "soft_optimization_exhausted",
  "historical_miss",
  "historical_shortfall",
]);
const requirementKindSchema = z.enum([
  "milestone_sequence",
  "cadence",
  "deadline_total",
]);
const eligibilityModeSchema = z.enum(PLANNER_ELIGIBILITY_MODES);

export const plannerGoalSchema = z
  .object({
    id: z.string().min(1).max(100),
    owner_id: z.string().min(1).max(100),
    title: z.string().min(1).max(1_000),
    description: z.string().max(10_000).nullable(),
    category: z.string().min(1).max(100),
    color: z.string().max(100).nullable(),
    frequency_type: z.enum(["fixed_milestones", "recurring"]),
    recurrence_interval: z.enum(["daily", "weekly", "monthly"]).nullable(),
    target_count: z.number().int().nonnegative().nullable(),
    milestone_names: z.array(z.string().max(1_000)).nullable(),
    start_date: dateSchema,
    end_date: nullableDateSchema,
    default_local_time: plannerLocalTimeSchema.nullable().optional(),
    photo_path: z.string().max(2_000).nullable(),
    team_id: z.string().min(1).max(100).nullable(),
    is_deleted: z.boolean(),
    archived_at: z.string().datetime({ offset: true }).nullable(),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const plannerCompletionSchema = z
  .object({
    id: z.string().min(1).max(100),
    goal_id: z.string().min(1).max(100),
    user_id: z.string().min(1).max(100),
    completed_on: dateSchema,
    source: z.enum(["manual", "linked_cascade"]),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();

const baseAssignmentSchema = z
  .object({
    goalId: z.string().min(1).max(100),
    requirementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    unitKey: z.string().min(1).max(100),
    scheduledDate: nullableDateSchema,
    locked: z.boolean(),
    scheduledTimeOverride: plannerLocalTimeSchema.nullable().optional(),
  })
  .strict();
const validBaseAssignmentSchema = baseAssignmentSchema.refine(
  (assignment) => !assignment.locked || assignment.scheduledDate !== null,
  "A locked planner assignment must have a scheduled date."
);

export const plannerKernelInputSchema = z
  .object({
    schemaVersion: z.literal(PLANNER_CONTRACT_VERSION),
    eligibilityMode: eligibilityModeSchema,
    solveIntent: z.enum(["stable", "replan"]).optional(),
    preserveExistingAssignments: z.boolean().optional(),
    draftPinnedDates: z.record(z.string(), dateSchema).optional(),
    ownerId: z.string().min(1).max(100),
    startDate: dateSchema,
    endDate: dateSchema,
    asOfDate: dateSchema,
    timezone: z.string().min(1).max(100),
    goals: z.array(plannerGoalSchema),
    completions: z.array(plannerCompletionSchema),
    links: z.array(
      z
        .object({
          sourceGoalId: z.string().min(1).max(100),
          targetGoalId: z.string().min(1).max(100),
        })
        .strict()
    ),
    assessments: z.array(goalAssessmentSchema).optional(),
    policy: plannerPolicySchema,
    basePlan: z
      .object({
        planId: z.string().min(1).max(100),
        version: z.number().int().positive(),
        assignments: z.array(validBaseAssignmentSchema),
        completionToUnit: z
          .record(
            z.string(),
            z
              .object({
                goalId: z.string().min(1).max(100),
                requirementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
                unitKey: z.string().min(1).max(100),
                completedOn: dateSchema,
              })
              .strict()
          )
          .optional(),
        issueCodes: z.array(issueCodeSchema).optional(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(
    (input) => input.timezone === input.policy.timezone,
    "Planner and policy timezones must match."
  )
  .refine(
    (input) => input.endDate >= input.startDate,
    "Planner window endDate must be on or after startDate."
  )
  .refine(
    (input) =>
      countDateWindowDays({ start: input.startDate, end: input.endDate }) <=
      MAX_PLANNER_WINDOW_DAYS,
    `Planner window cannot exceed ${MAX_PLANNER_WINDOW_DAYS} days.`
  )
  .refine(
    (input) =>
      isMonthAlignedPlannerWindow({
        start: input.startDate,
        end: input.endDate,
      }),
    "Planner window must start on day 1 and end on a month end."
  );

const workUnitSchema = z
  .object({
    originalGoalId: z.string().min(1).max(100),
    requirementSchemaVersion: z.literal(REQUIREMENT_SCHEMA_VERSION),
    requirementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    unitKey: z.string().min(1).max(100),
    kind: requirementKindSchema,
    ordinal: z.number().int().positive(),
    periodKey: dateSchema.nullable(),
    label: z.string().nullable(),
    creditWindow: z
      .object({ start: dateSchema, end: dateSchema })
      .strict(),
    placementWindow: z
      .object({ start: dateSchema, end: dateSchema })
      .strict()
      .nullable(),
    draftMoveWindow: z
      .object({ start: dateSchema, end: dateSchema })
      .strict()
      .nullable(),
    classification: z.enum([
      "fulfilled",
      "open",
      "future",
      "historical_shortfall",
      "historical_miss",
      "satisfied_elsewhere",
    ]),
    missPolicy: z.enum(["roll_forward", "remain_missed"]),
    restEligible: z.boolean(),
    maxPerDay: z.literal(1),
    creditedCompletionId: z.string().nullable(),
    creditedCompletionDate: nullableDateSchema,
    creditState: z.enum([
      "uncredited",
      "completed_as_scheduled",
      "completed_elsewhere",
    ]),
    scheduledDate: nullableDateSchema,
    locked: z.boolean(),
    goalDefaultLocalTime: plannerLocalTimeSchema.nullable().optional(),
    scheduledTimeOverride: plannerLocalTimeSchema.nullable().optional(),
    effectiveScheduledLocalTime: plannerLocalTimeSchema.nullable().optional(),
    effectiveScheduledAtLocal: plannerLocalDateTimeSchema.nullable().optional(),
  })
  .strict();

const solverResultSchema = z
  .object({
    assignments: z.array(
      z
        .object({
          goalId: z.string().min(1).max(100),
          unitKey: z.string().min(1).max(100),
          scheduledDate: nullableDateSchema,
        })
        .strict()
    ),
    placementStatus: z.enum(["complete", "partial"]),
    searchStatus: z.enum([
      "all_units_placed",
      "maximum_partial",
      "blocked_invalid_lock",
      "soft_optimization_exhausted",
    ]),
    capacityStatus: z.literal("unverified"),
    issueCodes: z.array(issueCodeSchema),
    invalidGoalIds: z.array(z.string().min(1).max(100)),
    publishable: z.boolean(),
    confirmationRequired: z.boolean(),
  })
  .strict();

const goalHorizonSummarySchema = z
  .object({
    goalId: z.string().min(1).max(100),
    kind: z.enum(["milestone_sequence", "deadline_total"]),
    totalCount: z.number().int().nonnegative(),
    creditedCount: z.number().int().nonnegative(),
    remainingCount: z.number().int().nonnegative(),
    windowPlannedCount: z.number().int().nonnegative(),
    months: z
      .array(
        z
          .object({
            month: monthSchema,
            plannedCount: z.number().int().nonnegative(),
          })
          .strict()
      )
      .max(MAX_HORIZON_MONTHS),
  })
  .strict();

export const plannerKernelOutputSchema = z
  .object({
    schemaVersion: z.literal(PLANNER_CONTRACT_VERSION),
    eligibilityMode: eligibilityModeSchema,
    preserveExistingAssignments: z.boolean(),
    generationInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    scopeState: z.enum(["historical", "current", "future"]),
    solver: solverResultSchema,
    workUnits: z.array(workUnitSchema),
    completionToUnit: z.record(
      z.string(),
      z
        .object({
          goalId: z.string().min(1).max(100),
          requirementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          unitKey: z.string().min(1).max(100),
          completedOn: dateSchema,
        })
        .strict()
    ),
    driftFacts: z.array(
      z
        .object({
          completionId: z.string(),
          completedOn: dateSchema,
          driftType: z.enum([
            "inadmissible",
            "out_of_plan",
            "credited_work_removed",
            "credited_work_reassigned",
          ]),
        })
        .strict()
    ),
    eligibility: z.array(
      z
        .object({
          goalId: z.string(),
          eligible: z.boolean(),
          reason: z.enum([
            "eligible",
            "not_owner",
            "deleted",
            "archived",
            "linked",
            "missing_end_date",
            "invalid_date_range",
            "end_outside_scope",
            "starts_after_scope",
            "horizon_too_long",
          ]),
        })
        .strict()
    ),
    diff: z.array(
      z
        .object({
          kind: z.enum([
            "added",
            "removed",
            "moved",
            "lock_changed",
            "issue_added",
            "issue_resolved",
          ]),
          goalId: z.string().nullable(),
          requirementFingerprint: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .nullable(),
          unitKey: z.string().nullable(),
          fromDate: nullableDateSchema,
          toDate: nullableDateSchema,
          issueCode: issueCodeSchema.nullable(),
        })
        .strict()
    ),
    validation: z
      .object({
        valid: z.boolean(),
        invariantViolations: z.array(z.string()),
      })
      .strict(),
    suggestedRelaxations: z.array(z.string()),
    horizonSummary: z.array(goalHorizonSummarySchema),
  })
  .strict();
