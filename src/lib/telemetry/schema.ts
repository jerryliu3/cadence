import { z } from "zod";
import {
  MAX_API_BODY_BYTES,
  MAX_CHAT_MESSAGES,
  MAX_COMPLETION_FACTS,
  MAX_ELIGIBLE_GOALS,
  MAX_POLICY_RANGES,
  MAX_WORK_UNITS,
} from "@/lib/planner/contracts/bounds";

export const TELEMETRY_SCHEMA_VERSION = "1" as const;

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const boundedCodeSchema = z.string().regex(/^[a-z0-9_.-]+$/).min(1).max(100);
const resultSchema = z.enum([
  "success",
  "partial",
  "conflict",
  "error",
  "disabled",
  "quota_rejected",
]);

const scopeSchema = z
  .object({
    month: monthSchema,
    timezone: z.string().min(1).max(100),
  })
  .strict()
  .nullable();

const versionsSchema = z
  .object({
    telemetrySchema: z.literal(TELEMETRY_SCHEMA_VERSION),
    eligibilityMode: z.string().min(1).max(50).nullable(),
    scheduler: z.string().min(1).max(50).nullable(),
    requirementSchema: z.string().min(1).max(50).nullable(),
    assessmentSchema: z.string().min(1).max(50).nullable(),
    prompt: z.string().min(1).max(50).nullable(),
  })
  .strict();

const countsSchema = z
  .object({
    eligibleGoals: z.number().int().min(0).max(MAX_ELIGIBLE_GOALS).optional(),
    workUnits: z.number().int().min(0).max(MAX_WORK_UNITS).optional(),
    completionFacts: z
      .number()
      .int()
      .min(0)
      .max(MAX_COMPLETION_FACTS)
      .optional(),
    policyRanges: z.number().int().min(0).max(MAX_POLICY_RANGES).optional(),
    chatMessages: z.number().int().min(0).max(MAX_CHAT_MESSAGES).optional(),
    placedUnits: z.number().int().min(0).max(MAX_WORK_UNITS).optional(),
    shortfallUnits: z.number().int().min(0).max(MAX_WORK_UNITS).optional(),
    timedUnits: z.number().int().min(0).max(MAX_WORK_UNITS).optional(),
    changedItems: z.number().int().min(0).max(MAX_WORK_UNITS).optional(),
    inputBytes: z.number().int().min(0).max(MAX_API_BODY_BYTES).optional(),
    outputBytes: z.number().int().min(0).max(MAX_API_BODY_BYTES).optional(),
    providerAttempts: z.number().int().min(0).max(100).optional(),
  })
  .strict();

const flagsSchema = z
  .object({
    plannerRead: z.boolean(),
    plannerGeneration: z.boolean(),
    plannerPlanWrites: z.boolean(),
    targetedExactCompletion: z.boolean(),
    coachAi: z.boolean(),
    overlap: z.boolean(),
  })
  .strict();

const commonEventSchema = z
  .object({
    schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
    timestamp: z.string().datetime({ offset: true }),
    correlationId: z.string().uuid(),
    environment: z.enum(["development", "test", "preview", "production"]),
    ownerPseudonym: z.string().regex(/^[a-f0-9]{64}$/),
    ownerPseudonymKeyVersion: z.number().int().positive().max(1_000_000),
    cohort: boundedCodeSchema,
    scope: scopeSchema,
    versions: versionsSchema,
    result: resultSchema,
    statusCode: z.number().int().min(100).max(599),
    errorCode: boundedCodeSchema.nullable(),
    durationMs: z.number().int().min(0).max(900_000),
    counts: countsSchema,
    replay: z.boolean(),
    flags: flagsSchema,
  })
  .strict();

const previewEventSchema = commonEventSchema
  .extend({
    eventName: z.literal("planner.preview.completed"),
    data: z
      .object({
        source: z.enum(["manual", "ai", "update"]),
        placementStatus: z.enum(["complete", "partial"]),
        searchStatus: z.enum([
          "all_units_placed",
          "maximum_partial",
          "blocked_invalid_lock",
          "soft_optimization_exhausted",
        ]),
        capacityStatus: z.literal("unverified"),
        boundsBucket: z.enum(["small", "medium", "large", "maximum"]),
      })
      .strict(),
  })
  .strict();

const publishEventSchema = commonEventSchema
  .extend({
    eventName: z.literal("planner.publish.completed"),
    data: z
      .object({
        source: z.enum(["manual", "ai", "update"]),
        placementStatus: z.enum(["complete", "partial"]),
        activated: z.boolean(),
      })
      .strict(),
  })
  .strict();

const mutationEventSchema = commonEventSchema
  .extend({
    eventName: z.literal("planner.mutation.completed"),
    data: z
      .object({
        action: z.enum([
          "move",
          "lock",
          "unlock",
          "dismiss",
          "supersede",
          "item_date_fact",
          "plan_goal_date_fact",
        ]),
      })
      .strict(),
  })
  .strict();

const stalenessEventSchema = commonEventSchema
  .extend({
    eventName: z.literal("planner.staleness.detected"),
    data: z
      .object({
        reasons: z
          .array(
            z.enum([
              "goal_changed",
              "policy_changed",
              "timezone_changed",
              "link_changed",
              "out_of_plan_fact",
              "inadmissible_fact",
              "credited_work_removed",
              "credited_work_reassigned",
              "overdue_item",
              "invalid_lock",
              "orphaned_goal",
            ])
          )
          .min(1)
          .max(20),
      })
      .strict(),
  })
  .strict();

const invariantEventSchema = commonEventSchema
  .extend({
    eventName: z.literal("planner.invariant.failed"),
    data: z
      .object({
        invariantCode: boundedCodeSchema,
        stage: z.enum(["preview", "publish", "read", "mutation"]),
      })
      .strict(),
  })
  .strict();

const targetedCompletionEventSchema = commonEventSchema
  .extend({
    eventName: z.literal("targeted_completion.completed"),
    data: z
      .object({
        route: z.enum(["item_date", "plan_goal_date", "canonical_exact_date"]),
        desiredFactState: z.enum(["present", "absent"]),
      })
      .strict(),
  })
  .strict();

const aiRequestEventSchema = commonEventSchema
  .extend({
    eventName: z.literal("ai.request.completed"),
    data: z
      .object({
        feature: z.enum(["planner_coach", "bulk_goal_parser"]),
        provider: z.enum(["gemini"]),
        attempt: z.number().int().positive().max(10),
      })
      .strict(),
  })
  .strict();

export const telemetryEventV1Schema = z
  .discriminatedUnion("eventName", [
    previewEventSchema,
    publishEventSchema,
    mutationEventSchema,
    stalenessEventSchema,
    invariantEventSchema,
    targetedCompletionEventSchema,
    aiRequestEventSchema,
  ])
  .superRefine((event, context) => {
    const successful = event.result === "success" || event.result === "partial";

    if (successful && event.errorCode !== null) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "Successful telemetry events cannot include an error code.",
      });
    }

    if (!successful && event.errorCode === null) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "Non-success telemetry events require a typed error code.",
      });
    }

    if (
      event.eventName.startsWith("planner.") &&
      event.eventName !== "planner.invariant.failed" &&
      event.scope === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["scope"],
        message: "Planner telemetry requires a monthly scope.",
      });
    }
  });

export type TelemetryEventV1 = z.infer<typeof telemetryEventV1Schema>;
