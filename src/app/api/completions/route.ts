import { NextResponse } from "next/server";
import { getDateInTimezone } from "@/lib/dates/timezone";
import {
  applyPlannerGoalDateFact,
  applyPlannerItemDateFact,
  targetedExactDateRequestSchema,
} from "@/lib/planner/exact-date-dispatch";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerRouteContext,
  withPlannerRoute,
} from "@/lib/planner/api";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 16 * 1024;

export async function handleCompletionPost(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const routeContext = await requirePlannerRouteContext(request);
    const {
      goalId,
      date,
      desiredFactState,
      timezone,
      plannerItemExpectation,
      plannerGoalExpectation,
    } = await parseBoundedJsonBody(
      request,
      MAX_REQUEST_BYTES,
      targetedExactDateRequestSchema
    );

    const { data: goal, error: goalError } = await routeContext.supabase
      .from("goals")
      .select("id, start_date, end_date")
      .eq("id", goalId)
      .maybeSingle();

    if (goalError || !goal) {
      throw new PlannerRouteError(
        404,
        "targeted_goal_not_found",
        "The goal was not found."
      );
    }

    if (plannerItemExpectation) {
      const result = await applyPlannerItemDateFact({
        supabase: routeContext.supabase,
        goalId,
        desiredFactState,
        timezone,
        goalLifetime: {
          startDate: goal.start_date,
          endDate: goal.end_date,
        },
        expectation: plannerItemExpectation,
      });
      if (!result.ok) {
        throw new PlannerRouteError(result.status, result.code, result.message);
      }
      return NextResponse.json(
        {
          schemaVersion: "1",
          ...result.payload,
          correlationId,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (plannerGoalExpectation) {
      const result = await applyPlannerGoalDateFact({
        supabase: routeContext.supabase,
        goalId,
        date,
        desiredFactState,
        timezone,
        goalLifetime: {
          startDate: goal.start_date,
          endDate: goal.end_date,
        },
        expectation: plannerGoalExpectation,
      });
      if (!result.ok) {
        throw new PlannerRouteError(result.status, result.code, result.message);
      }
      return NextResponse.json(
        {
          schemaVersion: "1",
          ...result.payload,
          correlationId,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (desiredFactState === "present") {
      const localToday = getDateInTimezone(new Date(), timezone);
      if (date > localToday) {
        throw new PlannerRouteError(
          422,
          "future_completion_not_allowed",
          "Completions can only be added for today or a past date."
        );
      }
      if (
        date < goal.start_date ||
        (goal.end_date !== null && date > goal.end_date)
      ) {
        throw new PlannerRouteError(
          422,
          "completion_outside_goal_lifetime",
          "The completion date must be within the goal lifetime."
        );
      }
    }

    const { error: mutationError } = await routeContext.supabase.rpc(
      desiredFactState === "present"
        ? "mark_goal_complete"
        : "unmark_goal_complete",
      {
        p_goal_id: goalId,
        p_date: date,
      }
    );

    if (mutationError) {
      throw new PlannerRouteError(
        409,
        "completion_update_failed",
        "The completion could not be updated."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        goalId,
        date,
        factState: desiredFactState,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  });
}

export async function POST(request: Request) {
  return handleCompletionPost(request);
}
