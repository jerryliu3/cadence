import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  createCorrelationId,
  handleApiRouteError,
  mapPostgrestWriteError,
  parseJsonBody,
  requireAuthenticatedRouteContext,
} from "@/lib/api/route-helpers";
import type {
  CreateGoalRequestBody,
  GoalMutationPayload,
  GoalPatchPayload,
  UpdateGoalRequestBody,
} from "@/lib/api/goals-social-contract";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTimeSchema = z.string().datetime({ offset: true });
const goalFrequencySchema = z.enum(["fixed_milestones", "recurring"]);
const recurrenceIntervalSchema = z.enum(["daily", "weekly", "monthly"]);

const createGoalPayloadSchema: z.ZodType<GoalMutationPayload> = z.object({
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

const createGoalRequestSchema: z.ZodType<CreateGoalRequestBody> = z.object({
  goal: createGoalPayloadSchema,
  addOwnerParticipant: z.boolean().optional(),
});

const updateGoalPatchSchema: z.ZodType<GoalPatchPayload> = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(4000).nullable().optional(),
    category: z.string().trim().min(1).max(120).optional(),
    color: z.string().max(32).nullable().optional(),
    frequency_type: goalFrequencySchema.optional(),
    recurrence_interval: recurrenceIntervalSchema.nullable().optional(),
    target_count: z.number().int().positive().nullable().optional(),
    milestone_names: z.array(z.string().max(80)).max(128).nullable().optional(),
    start_date: calendarDateSchema.optional(),
    end_date: calendarDateSchema.nullable().optional(),
    default_local_time: z.string().max(16).nullable().optional(),
    is_group: z.boolean().optional(),
    is_deleted: z.boolean().optional(),
    archived_at: dateTimeSchema.nullable().optional(),
    photo_path: z.string().max(4096).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one goal update field is required.",
  });

const updateGoalRequestSchema: z.ZodType<UpdateGoalRequestBody> = z.object({
  goalId: z.string().uuid(),
  updates: updateGoalPatchSchema,
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId } = await requireAuthenticatedRouteContext();
    const { goal, addOwnerParticipant = false } = await parseJsonBody({
      request,
      schema: createGoalRequestSchema,
    });

    const goalId = goal.id ?? randomUUID();
    const insertPayload: Database["public"]["Tables"]["goals"]["Insert"] = {
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

    const { error: goalError } = await supabase.from("goals").insert(insertPayload);
    if (goalError) {
      throw mapPostgrestWriteError({
        error: goalError,
        fallbackCode: "goal_create_failed",
        fallbackMessage: "Goal could not be created.",
      });
    }

    if (addOwnerParticipant) {
      const { error: participantError } = await supabase
        .from("goal_participants")
        .insert({
          goal_id: goalId,
          user_id: userId,
          role: "owner",
        });
      if (participantError) {
        const { error: rollbackError } = await supabase
          .from("goals")
          .delete()
          .eq("id", goalId)
          .eq("owner_id", userId);
        if (rollbackError) {
          console.error("Goal owner-participant rollback failed", {
            correlationId,
            goalId,
            participantError,
            rollbackError,
          });
        }
        throw mapPostgrestWriteError({
          error: participantError,
          fallbackCode: "goal_create_failed",
          fallbackMessage: "Goal could not be created.",
        });
      }
    }

    return apiSuccessResponse({ goalId }, correlationId, 201);
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}

export async function PATCH(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId } = await requireAuthenticatedRouteContext();
    const { goalId, updates } = await parseJsonBody({
      request,
      schema: updateGoalRequestSchema,
    });

    const goalUpdatePayload: Database["public"]["Tables"]["goals"]["Update"] =
      updates;

    const { data, error } = await supabase
      .from("goals")
      .update(goalUpdatePayload)
      .eq("id", goalId)
      .eq("owner_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw mapPostgrestWriteError({
        error,
        fallbackCode: "goal_update_failed",
        fallbackMessage: "Goal could not be updated.",
      });
    }

    if (!data) {
      throw new ApiRouteError(
        404,
        "goal_not_found",
        "Goal could not be found or is not accessible."
      );
    }

    return apiSuccessResponse({ goalId: data.id }, correlationId);
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
