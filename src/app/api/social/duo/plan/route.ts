import { NextResponse } from "next/server";
import { z } from "zod";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { toScopeMonthDate } from "@/lib/social/duo/planner-proposal";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const querySchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

function getCurrentScopeMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({
      supabase,
      requireDuo: true,
    });

    const url = new URL(request.url);
    const query = querySchema.parse({
      scopeMonth: url.searchParams.get("scopeMonth") ?? undefined,
    });
    const scopeMonth = query.scopeMonth ?? getCurrentScopeMonth();

    const { data, error } = await socialContext.supabase.rpc("get_duo_partner_plan_service", {
      p_scope_month: toScopeMonthDate(scopeMonth),
    });
    if (error) {
      throw new RouteError(500, "duo_partner_plan_unavailable", "Partner plan is unavailable.", {
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
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return routeErrorResponse(
        new RouteError(400, "invalid_scope_month", "Scope month query is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Duo partner plan request failed unexpectedly.",
    });
  }
}
