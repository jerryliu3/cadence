import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  apiSuccessResponse,
  createCorrelationId,
  handleApiRouteError,
  mapPostgrestWriteError,
  parseJsonBody,
  requireAuthenticatedRouteContext,
} from "@/lib/api/route-helpers";
import type {
  CreateGoalsBulkRequestBody,
  GoalMutationPayload,
} from "@/lib/api/goals-social-contract";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const goalFrequencySchema = z.enum(["fixed_milestones", "recurring"]);
const recurrenceIntervalSchema = z.enum(["daily", "weekly", "monthly"]);

const bulkGoalSchema: z.ZodType<GoalMutationPayload> = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable(),
  category: z.string().trim().min(1).max(120),
  color: z.string().max(32).nullable(),
  frequency_type: goalFrequencySchema,
  recurrence_interval: recurrenceIntervalSchema.nullable(),
  target_count: z.number().int().positive().nullable(),
  milestone_names: z.array(z.string().max(80)).max(128).nullable(),
  start_date: calendarDateSchema,
  end_date: calendarDateSchema.nullable(),
  default_local_time: z.string().max(16).nullable(),
  is_group: z.boolean(),
  is_deleted: z.boolean().optional(),
});

const bulkCreateRequestSchema: z.ZodType<CreateGoalsBulkRequestBody> = z.object({
  goals: z
    .array(bulkGoalSchema)
    .min(1, "At least one goal is required.")
    .max(200, "Create goals in batches of 200 or fewer."),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId } = await requireAuthenticatedRouteContext();
    const { goals } = await parseJsonBody({
      request,
      schema: bulkCreateRequestSchema,
      maxBytes: 512 * 1024,
    });

    const goalIds: string[] = [];
    const rows: Database["public"]["Tables"]["goals"]["Insert"][] = goals.map(
      (goal) => {
        const goalId = goal.id ?? randomUUID();
        goalIds.push(goalId);
        return {
          id: goalId,
          owner_id: userId,
          title: goal.title,
          description: goal.description,
          category: goal.category,
          color: goal.color,
          frequency_type: goal.frequency_type,
          recurrence_interval: goal.recurrence_interval,
          target_count: goal.target_count,
          milestone_names: goal.milestone_names,
          start_date: goal.start_date,
          end_date: goal.end_date,
          default_local_time: goal.default_local_time,
          is_group: goal.is_group,
          is_deleted: goal.is_deleted ?? false,
        };
      }
    );

    const { error } = await supabase.from("goals").insert(rows);
    if (error) {
      throw mapPostgrestWriteError({
        error,
        fallbackCode: "goal_bulk_create_failed",
        fallbackMessage: "Goals could not be created.",
      });
    }

    return apiSuccessResponse({ goalIds }, correlationId, 201);
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
