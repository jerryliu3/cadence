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
  CreateGoalSharesRequestBody,
  DeleteGoalShareRequestBody,
} from "@/lib/api/goals-social-contract";

export const runtime = "nodejs";

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
      throw mapPostgrestWriteError({
        error,
        fallbackCode: "goal_share_create_failed",
        fallbackMessage: "Goal sharing failed.",
      });
    }

    return apiSuccessResponse(
      { sharedCount: dedupedGoalIds.length },
      correlationId,
      201
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
      throw mapPostgrestWriteError({
        error,
        fallbackCode: "goal_share_delete_failed",
        fallbackMessage: "Goal share could not be removed.",
      });
    }

    return apiSuccessResponse({ success: true }, correlationId);
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
