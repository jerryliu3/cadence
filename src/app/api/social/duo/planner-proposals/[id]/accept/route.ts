import { NextResponse } from "next/server";
import { z } from "zod";
import { runAfterResponse } from "@/lib/api/after";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { flushNotificationOutbox } from "@/lib/push/outbox";
import {
  applyPlannerProposalOperations,
  plannerProposalOperationsSchema,
} from "@/lib/social/duo/planner-proposal";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
});

type ProposalRow = {
  id: string;
  targetOwnerId: string;
  scopeMonth: string;
  status: string;
  baselineScheduleDigest: string;
  operations: unknown;
};

function getNextScopeMonth(scopeMonth: string) {
  const [yearPart, monthPart] = scopeMonth.split("-");
  const date = new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

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

    const { data: proposalRows, error: proposalError } = await socialContext.supabase.rpc(
      "get_planner_proposals_service",
      {
        p_scope_month: undefined,
      }
    );
    if (proposalError) {
      throw new RouteError(500, "planner_proposals_unavailable", "Planner proposals are unavailable.", {
        cause: proposalError.message,
      });
    }

    const proposal = (proposalRows ?? [])
      .map((row) => ({
        id: row.id,
        targetOwnerId: row.target_owner_id,
        scopeMonth: row.scope_month,
        status: row.status,
        baselineScheduleDigest: row.baseline_schedule_digest,
        operations: row.operations,
      }))
      .find((row) => row.id === params.id) as ProposalRow | undefined;

    if (!proposal) {
      throw new RouteError(404, "proposal_not_found", "Planner proposal was not found.");
    }
    if (proposal.targetOwnerId !== socialContext.userId) {
      throw new RouteError(403, "proposal_not_target_owner", "Only the target owner can accept.");
    }
    if (proposal.status !== "pending") {
      throw new RouteError(409, "proposal_not_pending", "Planner proposal is no longer pending.");
    }

    const { data: digest, error: digestError } = await socialContext.supabase.rpc(
      "get_planner_schedule_digest",
      {
        p_owner: socialContext.userId,
      }
    );
    if (digestError) {
      throw new RouteError(500, "planner_digest_unavailable", "Planner digest is unavailable.", {
        cause: digestError.message,
      });
    }

    if (digest !== proposal.baselineScheduleDigest) {
      await socialContext.supabase.rpc("resolve_planner_proposal_service", {
        p_proposal_id: proposal.id,
        p_resolution: "stale",
        p_applied_digest: undefined,
      });
      runAfterResponse(() => flushNotificationOutbox({ limit: 20 }));
      throw new RouteError(
        409,
        "stale_proposal",
        "Planner schedule changed since this proposal was created."
      );
    }

    const scopeMonth = proposal.scopeMonth.slice(0, 7);
    const monthStart = `${scopeMonth}-01`;
    const nextMonthStart = getNextScopeMonth(scopeMonth);
    const { data: rawItems, error: itemsError } = await socialContext.supabase
      .from("planner_items")
      .select("goal_id,unit_key,scheduled_date,scheduled_time,locked")
      .eq("owner_id", socialContext.userId)
      .gte("scheduled_date", monthStart)
      .lt("scheduled_date", nextMonthStart);
    if (itemsError) {
      throw new RouteError(500, "planner_items_unavailable", "Planner items are unavailable.", {
        cause: itemsError.message,
      });
    }

    const operations = plannerProposalOperationsSchema.parse(proposal.operations);
    const nextItems = applyPlannerProposalOperations({
      scopeMonth,
      items: (rawItems ?? []).map((item) => ({
        goalId: item.goal_id,
        unitKey: item.unit_key,
        scheduledDate: item.scheduled_date,
        scheduledTime: item.scheduled_time,
        locked: item.locked,
      })),
      operations,
    });

    const { data: publishData, error: publishError } = await socialContext.supabase.rpc(
      "set_planner_schedule",
      {
        p_month: monthStart,
        p_items: nextItems.map((item) => ({
          goal_id: item.goalId,
          unit_key: item.unitKey,
          scheduled_date: item.scheduledDate,
          scheduled_time: item.scheduledTime,
          locked: item.locked,
        })),
        p_expected_digest: digest,
      }
    );
    if (publishError) {
      throw new RouteError(409, "planner_proposal_apply_failed", "Could not apply planner proposal.", {
        cause: publishError.message,
      });
    }

    const row = Array.isArray(publishData) ? publishData[0] : publishData;
    const appliedDigest = row?.schedule_digest ?? null;
    const { data: resolved, error: resolveError } = await socialContext.supabase.rpc(
      "resolve_planner_proposal_service",
      {
        p_proposal_id: proposal.id,
        p_resolution: "accepted",
        p_applied_digest: appliedDigest ?? undefined,
      }
    );
    if (resolveError || !resolved) {
      throw new RouteError(500, "planner_proposal_resolve_failed", "Proposal could not be marked accepted.", {
        cause: resolveError?.message,
      });
    }

    runAfterResponse(() => flushNotificationOutbox({ limit: 20 }));

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        proposalId: proposal.id,
        accepted: true,
        scheduleDigest: appliedDigest,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return routeErrorResponse(
        new RouteError(400, "validation_failed", "Proposal payload failed validation.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    if (error instanceof Error && error.message.includes("missing item")) {
      return routeErrorResponse(
        new RouteError(422, "proposal_item_missing", error.message),
        correlationId
      );
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Planner proposal accept request failed unexpectedly.",
    });
  }
}
