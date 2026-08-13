import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiRouteError, apiErrorResponse, createCorrelationId } from "@/lib/api/route";
import { getCurrentScopeMonth, toScopeMonthDate } from "@/lib/social/team/planner-proposal";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const querySchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

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
    const scopeMonth = query.scopeMonth ?? getCurrentScopeMonth();

    const { data, error } = await socialContext.supabase.rpc("get_team_partner_plan_service", {
      p_scope_month: toScopeMonthDate(scopeMonth),
    });
    if (error) {
      throw new ApiRouteError(500, "team_partner_plan_unavailable", "Partner plan is unavailable.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        scopeMonth,
        items: (data ?? []).map((row) => ({
          itemId: row.item_id,
          ownerId: row.owner_id,
          goalId: row.goal_id,
          goalTitle: row.goal_title,
          unitKey: row.unit_key,
          scheduledDate: row.scheduled_date,
          scheduledTime: row.scheduled_time,
          locked: row.locked,
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
      new ApiRouteError(500, "internal_error", "Team partner plan request failed unexpectedly."),
      correlationId
    );
  }
}
