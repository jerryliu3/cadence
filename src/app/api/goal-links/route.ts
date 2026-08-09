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
  CreateGoalLinksBulkRequestBody,
  ReplaceGoalLinkRequestBody,
} from "@/lib/api/goals-social-contract";

const linkSchema = z.object({
  sourceGoalId: z.string().uuid(),
  targetGoalId: z.string().uuid(),
});

const bulkLinkRequestSchema: z.ZodType<CreateGoalLinksBulkRequestBody> = z.object({
  links: z.array(linkSchema).min(1).max(500),
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
      throw new ApiRouteError(
        500,
        "goal_links_insert_failed",
        error.message ?? "Goal links could not be saved."
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
      throw new ApiRouteError(
        500,
        "goal_links_replace_failed",
        deleteError.message ?? "Goal links could not be updated."
      );
    }

    if (targetGoalId) {
      const { error: insertError } = await supabase.from("goal_links").insert({
        owner_id: userId,
        source_goal_id: sourceGoalId,
        target_goal_id: targetGoalId,
      });
      if (insertError) {
        throw new ApiRouteError(
          500,
          "goal_links_replace_failed",
          insertError.message ?? "Goal links could not be updated."
        );
      }
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
