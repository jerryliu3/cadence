import { NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerRouteContext,
  withPlannerRoute,
} from "@/lib/planner/api";
import { MAX_API_BODY_BYTES } from "@/lib/planner/contracts/bounds";
import { postgresErrorMatches } from "@/lib/planner/postgres-errors";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const sessionSchema = z.object({
  scheduled_date: z.iso.date(),
  scheduled_time: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .nullable()
    .optional(),
});

const trainingGoalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
  category_key: z.string().trim().max(80).optional().nullable(),
  color: z.string().trim().max(16).optional().nullable(),
  frequency_type: z.enum(["recurring", "fixed_milestones"]).optional(),
  recurrence_interval: z.enum(["daily", "weekly", "monthly"]).optional().nullable(),
  target_count: z.number().int().positive().optional().nullable(),
  start_date: z.iso.date().optional(),
  end_date: z.iso.date().optional().nullable(),
  default_local_time: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .optional()
    .nullable(),
  sessions: z.array(sessionSchema).max(366).default([]),
});

const importSchema = z.object({
  goals: z.array(trainingGoalSchema).min(1).max(60),
});

export async function POST(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const routeContext = await requirePlannerRouteContext(request);
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 512 * 1024),
      importSchema
    );
    const response = await routeContext.supabase.rpc("import_training_plan", {
      p_goals: body.goals as unknown as Json,
    });
    if (response.error) {
      if (
        response.error.code === "22023" ||
        response.error.code === "22P02" ||
        response.error.code === "22001" ||
        response.error.code === "23514"
      ) {
        throw new PlannerRouteError(
          400,
          "validation_failed",
          "Training-plan payload failed validation."
        );
      }
      if (postgresErrorMatches(response.error, "P0001", "schedule_conflict")) {
        throw new PlannerRouteError(
          409,
          "schedule_conflict",
          "Training-plan import hit a planner schedule conflict."
        );
      }
      if (
        postgresErrorMatches(
          response.error,
          "P0001",
          "scheduled_outside_goal_lifetime"
        )
      ) {
        throw new PlannerRouteError(
          422,
          "planner_not_publishable",
          "One or more imported sessions are outside goal lifetime."
        );
      }
      if (
        postgresErrorMatches(
          response.error,
          "22023",
          "invalid_training_plan_payload"
        ) ||
        postgresErrorMatches(
          response.error,
          "22023",
          "invalid_training_plan_session"
        ) ||
        postgresErrorMatches(response.error, "22023", "invalid_scheduled_time")
      ) {
        throw new PlannerRouteError(
          400,
          "validation_failed",
          "Training-plan payload failed validation."
        );
      }
      throw new PlannerRouteError(
        409,
        "training_plan_import_failed",
        "Training-plan import could not be completed.",
        { cause: response.error.message }
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Training-plan import did not return import metadata."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        goalCount: typeof row.goal_count === "number" ? row.goal_count : 0,
        sessionCount:
          typeof row.session_count === "number" ? row.session_count : 0,
        scheduleDigest:
          typeof row.schedule_digest === "string" ? row.schedule_digest : null,
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  });
}
