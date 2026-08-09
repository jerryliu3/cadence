import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiRouteError,
  createCorrelationId,
  handleApiRouteError,
  parseJsonBody,
  requireAuthenticatedRouteContext,
} from "@/lib/api/route-helpers";
import type { Database } from "@/lib/supabase/database.types";

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTimeSchema = z.string().datetime({ offset: true });
const goalFrequencySchema = z.enum(["fixed_milestones", "recurring"]);
const recurrenceIntervalSchema = z.enum(["daily", "weekly", "monthly"]);

const createGoalPayloadSchema = z.object({
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

const createGoalRequestSchema = z.object({
  goal: createGoalPayloadSchema,
  addOwnerParticipant: z.boolean().optional(),
});

const updateGoalPatchSchema = z
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

const updateGoalRequestSchema = z.object({
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

    const { error } = await supabase.from("goals").insert(insertPayload);
    if (error) {
      throw new ApiRouteError(
        500,
        "goal_create_failed",
        error.message ?? "Goal could not be created."
      );
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
        console.error(
          "Failed to attach owner as participant after goal creation:",
          participantError
        );
      }
    }

    return NextResponse.json(
      { goalId },
      { headers: { "Cache-Control": "no-store" } }
    );
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
      throw new ApiRouteError(
        500,
        "goal_update_failed",
        error.message ?? "Goal could not be updated."
      );
    }

    if (!data) {
      throw new ApiRouteError(404, "goal_not_found", "Goal could not be found.");
    }

    return NextResponse.json(
      { goalId: data.id },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
