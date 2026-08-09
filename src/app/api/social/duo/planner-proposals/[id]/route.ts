import { NextResponse } from "next/server";
import { z } from "zod";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
});

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({
      supabase,
      requireDuo: true,
    });

    const { data, error } = await socialContext.supabase.rpc("resolve_planner_proposal_service", {
      p_proposal_id: params.id,
      p_resolution: "withdrawn",
      p_applied_digest: undefined,
    });
    if (error) {
      throw new RouteError(500, "planner_proposal_withdraw_failed", "Proposal withdraw failed.", {
        cause: error.message,
      });
    }
    if (!data) {
      throw new RouteError(404, "proposal_not_pending", "Proposal is not pending or not available.");
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        proposalId: params.id,
        withdrawn: true,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return routeErrorResponse(
        new RouteError(400, "invalid_proposal_id", "Proposal id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Planner proposal withdraw request failed unexpectedly.",
    });
  }
}
