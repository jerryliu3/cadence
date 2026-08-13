import { NextResponse } from "next/server";
import { z } from "zod";
import { runAfterResponse } from "@/lib/api/after";
import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  parseJsonBody,
} from "@/lib/api/route";
import { flushNotificationOutbox } from "@/lib/push/outbox";
import { createPlannerProposalSchema, toScopeMonthDate } from "@/lib/social/team/planner-proposal";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const querySchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

function mapCreateError(message: string) {
  if (message === "team_required") {
    return new ApiRouteError(409, "team_required", "An active team is required to create proposals.");
  }
  if (message === "proposals_not_allowed") {
    return new ApiRouteError(403, "proposals_not_allowed", "Your partner disabled planner proposals.");
  }
  if (message === "proposal_already_pending") {
    return new ApiRouteError(
      409,
      "proposal_already_pending",
      "There is already a pending proposal for this partner and month."
    );
  }
  if (message === "move_date_outside_scope_month") {
    return new ApiRouteError(
      400,
      "move_date_outside_scope_month",
      "Move dates must stay inside the proposal month."
    );
  }
  return new ApiRouteError(500, "planner_proposal_create_failed", "Could not create planner proposal.", {
    cause: message,
  });
}

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({
      supabase,
    });
    const url = new URL(request.url);
    const query = querySchema.parse({
      scopeMonth: url.searchParams.get("scopeMonth") ?? undefined,
    });

    const { data, error } = await socialContext.supabase.rpc("get_planner_proposals_service", {
      p_scope_month: query.scopeMonth ? toScopeMonthDate(query.scopeMonth) : undefined,
    });
    if (error) {
      throw new ApiRouteError(
        500,
        "planner_proposals_unavailable",
        "Planner proposals are unavailable.",
        {
        cause: error.message,
        }
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (data ?? []).map((row) => ({
          id: row.id,
          teamId: row.team_id,
          proposerId: row.proposer_id,
          targetOwnerId: row.target_owner_id,
          scopeMonth: row.scope_month,
          status: row.status,
          baselineScheduleDigest: row.baseline_schedule_digest,
          operations: row.operations,
          note: row.note,
          createdAt: row.created_at,
          decidedAt: row.decided_at,
          appliedDigest: row.applied_digest,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "invalid_scope_month", "Scope month query is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(
      new ApiRouteError(500, "internal_error", "Planner proposals request failed unexpectedly."),
      correlationId
    );
  }
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({
      supabase,
    });
    const body = await parseJsonBody({
      request,
      maxBytes: 32 * 1024,
      schema: createPlannerProposalSchema,
    });

    const { data, error } = await socialContext.supabase.rpc("create_planner_proposal_service", {
      p_target_owner_id: body.targetOwnerId,
      p_scope_month: toScopeMonthDate(body.scopeMonth),
      p_operations: body.operations,
      p_note: body.note ?? undefined,
    });
    if (error) {
      throw mapCreateError(error.message);
    }

    runAfterResponse(() => flushNotificationOutbox({ limit: 20 }));

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        proposalId: data,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "validation_failed", "Request payload failed validation.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(
      new ApiRouteError(
        500,
        "internal_error",
        "Planner proposal create request failed unexpectedly."
      ),
      correlationId
    );
  }
}
