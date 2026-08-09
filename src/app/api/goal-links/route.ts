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
  CreateGoalLinksBulkRequestBody,
  ReplaceGoalLinkRequestBody,
} from "@/lib/api/goals-social-contract";

export const runtime = "nodejs";

const linkSchema = z.object({
  sourceGoalId: z.string().uuid(),
  targetGoalId: z.string().uuid(),
});

const bulkLinkRequestSchema: z.ZodType<CreateGoalLinksBulkRequestBody> = z.object({
  links: z
    .array(linkSchema)
    .min(1, "At least one goal link is required.")
    .max(500, "Create goal links in batches of 500 or fewer."),
});

const replaceLinkRequestSchema: z.ZodType<ReplaceGoalLinkRequestBody> = z.object({
  sourceGoalId: z.string().uuid(),
  targetGoalId: z.string().uuid().nullable(),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId } = await requireAuthenticatedRouteContext();
    const { links } = await parseJsonBody({
      request,
      schema: bulkLinkRequestSchema,
      maxBytes: 256 * 1024,
    });

    const { error } = await supabase.from("goal_links").insert(
      links.map((entry) => ({
        owner_id: userId,
        source_goal_id: entry.sourceGoalId,
        target_goal_id: entry.targetGoalId,
      }))
    );
    if (error) {
      throw mapPostgrestWriteError({
        error,
        fallbackCode: "goal_links_insert_failed",
        fallbackMessage: "Goal links could not be saved.",
      });
    }

    return apiSuccessResponse({ success: true }, correlationId, 201);
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}

export async function PUT(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId } = await requireAuthenticatedRouteContext();
    const { sourceGoalId, targetGoalId } = await parseJsonBody({
      request,
      schema: replaceLinkRequestSchema,
    });

    const { error: deleteError } = await supabase
      .from("goal_links")
      .delete()
      .eq("owner_id", userId)
      .eq("source_goal_id", sourceGoalId);
    if (deleteError) {
      throw mapPostgrestWriteError({
        error: deleteError,
        fallbackCode: "goal_links_replace_failed",
        fallbackMessage: "Goal links could not be updated.",
      });
    }

    if (targetGoalId) {
      const { error: insertError } = await supabase.from("goal_links").insert({
        owner_id: userId,
        source_goal_id: sourceGoalId,
        target_goal_id: targetGoalId,
      });
      if (insertError) {
        throw mapPostgrestWriteError({
          error: insertError,
          fallbackCode: "goal_links_replace_failed",
          fallbackMessage: "Goal links could not be updated.",
        });
      }
    }

    return apiSuccessResponse({ success: true }, correlationId);
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
