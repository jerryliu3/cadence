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
  CreateGoalSharesRequestBody,
  DeleteGoalShareRequestBody,
} from "@/lib/api/goals-social-contract";

const createSharesRequestSchema: z.ZodType<CreateGoalSharesRequestBody> = z.object({
  goalIds: z.array(z.string().uuid()).min(1).max(200),
  sharedWithUserId: z.string().uuid(),
});

const deleteShareRequestSchema: z.ZodType<DeleteGoalShareRequestBody> = z.object({
  goalId: z.string().uuid(),
  sharedWithUserId: z.string().uuid(),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase } = await requireAuthenticatedRouteContext();
    const { goalIds, sharedWithUserId } = await parseJsonBody({
      request,
      schema: createSharesRequestSchema,
      maxBytes: 128 * 1024,
    });

    const dedupedGoalIds = Array.from(new Set(goalIds));
    const { error } = await supabase.from("goal_shares").insert(
      dedupedGoalIds.map((goalId) => ({
        goal_id: goalId,
        shared_with: sharedWithUserId,
      }))
    );

    if (error) {
      throw new ApiRouteError(
        500,
        "goal_share_create_failed",
        error.message ?? "Goal sharing failed."
      );
    }

    return NextResponse.json(
      { sharedCount: dedupedGoalIds.length },
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
    const { goalId, sharedWithUserId } = await parseJsonBody({
      request,
      schema: deleteShareRequestSchema,
    });

    const { error } = await supabase
      .from("goal_shares")
      .delete()
      .eq("goal_id", goalId)
      .eq("shared_with", sharedWithUserId);

    if (error) {
      throw new ApiRouteError(
        500,
        "goal_share_delete_failed",
        error.message ?? "Goal share could not be removed."
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
