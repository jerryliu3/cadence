import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiRouteError,
  createCorrelationId,
  handleApiRouteError,
  parseJsonBody,
  requireAuthenticatedRouteContext,
} from "@/lib/api/route-helpers";
import type {
  AddGoalParticipantRequestBody,
  RemoveGoalParticipantRequestBody,
} from "@/lib/api/goals-social-contract";

const participantRoleSchema = z.enum(["owner", "participant"]);

const addParticipantRequestSchema: z.ZodType<AddGoalParticipantRequestBody> = z.object({
  goalId: z.string().uuid(),
  userId: z.string().uuid(),
  role: participantRoleSchema.optional(),
});

const removeParticipantRequestSchema: z.ZodType<RemoveGoalParticipantRequestBody> =
  z.object({
  goalId: z.string().uuid(),
  userId: z.string().uuid(),
  });

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId: actorUserId } = await requireAuthenticatedRouteContext();
    const { goalId, userId, role } = await parseJsonBody({
      request,
      schema: addParticipantRequestSchema,
    });

    const participantRole = role ?? "participant";
    if (participantRole === "owner" && userId !== actorUserId) {
      throw new ApiRouteError(
        403,
        "owner_role_forbidden",
        "Owner role can only be assigned to the authenticated user."
      );
    }

    const { error } = await supabase.from("goal_participants").insert({
      goal_id: goalId,
      user_id: userId,
      role: participantRole,
    });

    if (error) {
      throw new ApiRouteError(
        500,
        "goal_participant_add_failed",
        error.message ?? "Participant could not be added."
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}

export async function DELETE(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase } = await requireAuthenticatedRouteContext();
    const { goalId, userId } = await parseJsonBody({
      request,
      schema: removeParticipantRequestSchema,
    });

    const { error } = await supabase
      .from("goal_participants")
      .delete()
      .eq("goal_id", goalId)
      .eq("user_id", userId);

    if (error) {
      throw new ApiRouteError(
        500,
        "goal_participant_remove_failed",
        error.message ?? "Participant could not be removed."
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
