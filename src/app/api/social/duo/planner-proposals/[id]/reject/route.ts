import { NextResponse } from "next/server";
import { z } from "zod";
import { runAfterResponse } from "@/lib/api/after";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { flushNotificationOutbox } from "@/lib/push/outbox";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
});

export async function POST(
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
      p_resolution: "rejected",
      p_applied_digest: undefined,
    });
    if (error) {
      throw new RouteError(500, "planner_proposal_reject_failed", "Proposal reject failed.", {
        cause: error.message,
      });
    }
    if (!data) {
      throw new RouteError(404, "proposal_not_pending", "Proposal is not pending or not available.");
    }

    runAfterResponse(() => flushNotificationOutbox({ limit: 20 }));

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        proposalId: params.id,
        rejected: true,
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
      message: "Planner proposal reject request failed unexpectedly.",
    });
  }
}
