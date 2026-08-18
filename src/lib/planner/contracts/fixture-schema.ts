import { z } from "zod";
import {
  MAX_WORK_UNITS,
  PLANNER_CONTRACT_VERSION,
} from "./bounds";

const caseIdSchema = z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/).max(100);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const nullableDateSchema = dateSchema.nullable();
const requirementKindSchema = z.enum([
  "milestone_sequence",
  "cadence",
  "deadline_total",
]);

const expectedLifecycleSchema = z
  .object({
    lifecycle: z.enum(["upcoming", "active", "ended", "archived"]),
    outcome: z.enum(["in_progress", "achieved", "ended_with_shortfall"]),
    calendarEligible: z.boolean(),
    placementTerminal: z.boolean(),
  })
  .strict();

export const lifecycleOutcomeFixtureSchema = z
  .object({
    schemaVersion: z.literal(PLANNER_CONTRACT_VERSION),
    contract: z.literal("lifecycle_outcome"),
    cases: z
      .array(
        z
          .object({
            id: caseIdSchema,
            description: z.string().min(1).max(300),
            input: z
              .object({
                asOfDate: dateSchema,
                startDate: nullableDateSchema,
                endDate: nullableDateSchema,
                archivedAt: z.string().datetime({ offset: true }).nullable(),
                requirementKind: requirementKindSchema,
                requiredUnits: z.number().int().min(0).max(MAX_WORK_UNITS),
                admissibleUnitsByDeadline: z
                  .number()
                  .int()
                  .min(0)
                  .max(MAX_WORK_UNITS),
                allExpectedCadencePeriodsSatisfied: z.boolean().nullable(),
                hasLateOrExcessFacts: z.boolean(),
              })
              .strict(),
            expected: expectedLifecycleSchema,
          })
          .strict()
      )
      .min(1),
  })
  .strict();

const eligibilityReasonSchema = z.enum([
  "eligible",
  "not_owner",
  "deleted",
  "archived",
  "linked_target",
  "invalid_date_range",
  "end_outside_scope",
  "starts_after_scope",
  "horizon_too_long",
  "target_exceeds_work_unit_limit",
]);

export const eligibilityFixtureSchema = z
  .object({
    schemaVersion: z.literal(PLANNER_CONTRACT_VERSION),
    contract: z.literal("eligibility"),
    eligibilityMode: z.literal("overlap_v1"),
    cases: z
      .array(
        z
          .object({
            id: caseIdSchema,
            description: z.string().min(1).max(300),
            scopeMonth: monthSchema,
            goal: z
              .object({
                ownedByViewer: z.boolean(),
                isDeleted: z.boolean(),
                archivedAt: z.string().datetime({ offset: true }).nullable(),
                currentLinkRole: z.enum(["none", "source", "target"]),
                outgoingShareCount: z.number().int().min(0).max(1_000),
                startDate: dateSchema,
                endDate: nullableDateSchema,
              })
              .strict(),
            expected: z
              .object({
                eligible: z.boolean(),
                reason: eligibilityReasonSchema,
              })
              .strict(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

const dispatchRouteSchema = z.enum([
  "item_date",
  "plan_goal_date",
  "canonical_exact_date",
  "legacy_period",
  "disabled",
]);

export const completionDispatchFixtureSchema = z
  .object({
    schemaVersion: z.literal(PLANNER_CONTRACT_VERSION),
    contract: z.literal("completion_dispatch"),
    cases: z
      .array(
        z
          .object({
            id: caseIdSchema,
            description: z.string().min(1).max(300),
            input: z
              .object({
                requirementKind: requirementKindSchema,
                targetedRecurring: z.boolean(),
                activePlanMembership: z.boolean(),
                matchingItemState: z.enum([
                  "none",
                  "actionable",
                  "satisfied_elsewhere",
                  "historical",
                ]),
                selectedDateState: z.enum(["past", "today", "future"]),
                existingExactFact: z.boolean(),
                desiredFactState: z.enum(["present", "absent"]),
              })
              .strict(),
            expected: z
              .object({
                route: dispatchRouteSchema,
                exactDateOnly: z.boolean(),
                allowed: z.boolean(),
                reason: z.enum([
                  "allowed",
                  "satisfied_elsewhere",
                  "future_creation",
                  "legacy_period_semantics",
                ]),
              })
              .strict(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

const solverUnitSchema = z
  .object({
    unitKey: z.string().min(1).max(100),
    goalId: z.string().min(1).max(100),
    kind: requirementKindSchema,
    ordinal: z.number().int().positive(),
    candidateDates: z.array(dateSchema).max(31),
    previousDate: nullableDateSchema,
    lockedDate: nullableDateSchema,
  })
  .strip();

export const solverFixtureSchema = z
  .object({
    schemaVersion: z.literal(PLANNER_CONTRACT_VERSION),
    contract: z.literal("solver"),
    schedulerVersion: z.literal("ordered-dp-v1"),
    cases: z
      .array(
        z
          .object({
            id: caseIdSchema,
            description: z.string().min(1).max(300),
            dates: z.array(dateSchema).max(31),
            units: z.array(solverUnitSchema).max(MAX_WORK_UNITS),
            expected: z
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
                ]),
                capacityStatus: z.literal("unverified"),
                issueCodes: z.array(
                  z.enum([
                    "placement_shortfall",
                    "invalid_lock",
                    "historical_miss",
                    "historical_shortfall",
                  ])
                ),
                invalidGoalIds: z.array(
                  z.string().min(1).max(100)
                ),
                publishable: z.boolean(),
                confirmationRequired: z.boolean(),
              })
              .strict(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

export const plannerContractFixtureSchema = z.discriminatedUnion("contract", [
  lifecycleOutcomeFixtureSchema,
  eligibilityFixtureSchema,
  completionDispatchFixtureSchema,
  solverFixtureSchema,
]);

export type PlannerContractFixture = z.infer<typeof plannerContractFixtureSchema>;
