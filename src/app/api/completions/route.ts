import { NextResponse } from "next/server";
import { parseBoundedJsonBody } from "@/lib/api/body";
import { createCorrelationId, requireAuthenticatedUser } from "@/lib/api/context";
import { RouteError, routeErrorResponse } from "@/lib/api/errors";
import {
  getDateInTimezone,
} from "@/lib/dates/timezone";
import { getPlannerCapabilities } from "@/lib/planner/capabilities";
import {
  applyPlannerGoalDateFact,
  applyPlannerItemDateFact,
  targetedExactDateRequestSchema,
} from "@/lib/planner/exact-date-dispatch";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 16 * 1024;

function errorResponse(
  status: number,
  code: string,
  message: string,
  correlationId: string
) {
  return NextResponse.json(
    { code, message, correlationId },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function handleCompletionPost(request: Request) {
  const correlationId = createCorrelationId();
  const supabase = await createClient();
  try {
    await requireAuthenticatedUser(supabase, {
      message: "Sign in to update goal completions.",
    });
  } catch (error) {
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    return errorResponse(
      500,
      "internal_error",
      "Completion updates are temporarily unavailable.",
      correlationId
    );
  }

  let capabilities;
  try {
    capabilities = getPlannerCapabilities();
  } catch {
    return errorResponse(
      503,
      "capability_configuration_invalid",
      "Completion updates are temporarily unavailable.",
      correlationId
    );
  }
  if (!capabilities.calendarEnabled) {
    return errorResponse(
      503,
      "targeted_exact_completion_disabled",
      "Exact-date completion updates are temporarily unavailable.",
      correlationId
    );
  }

  let parsedRequest;
  try {
    parsedRequest = await parseBoundedJsonBody(
      request,
      MAX_REQUEST_BYTES,
      targetedExactDateRequestSchema
    );
  } catch (error) {
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    return errorResponse(
      500,
      "internal_error",
      "Completion updates are temporarily unavailable.",
      correlationId
    );
  }

  const {
    goalId,
    date,
    desiredFactState,
    timezone,
    plannerItemExpectation,
    plannerGoalExpectation,
  } = parsedRequest;

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, start_date, end_date")
    .eq("id", goalId)
    .maybeSingle();

  if (goalError || !goal) {
    return errorResponse(
      404,
      "targeted_goal_not_found",
      "The goal was not found.",
      correlationId
    );
  }

  if (plannerItemExpectation) {
    const result = await applyPlannerItemDateFact({
      supabase,
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
      return errorResponse(
        result.status,
        result.code,
        result.message,
        correlationId
      );
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
      supabase,
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
      return errorResponse(
        result.status,
        result.code,
        result.message,
        correlationId
      );
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
      return errorResponse(
        422,
        "future_completion_not_allowed",
        "Completions can only be added for today or a past date.",
        correlationId
      );
    }
    if (
      date < goal.start_date ||
      (goal.end_date !== null && date > goal.end_date)
    ) {
      return errorResponse(
        422,
        "completion_outside_goal_lifetime",
        "The completion date must be within the goal lifetime.",
        correlationId
      );
    }
  }

  const { error: mutationError } = await supabase.rpc(
    desiredFactState === "present"
      ? "mark_goal_complete"
      : "unmark_goal_complete",
    {
      p_goal_id: goalId,
      p_date: date,
    }
  );

  if (mutationError) {
    return errorResponse(
      409,
      "completion_update_failed",
      "The completion could not be updated.",
      correlationId
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
}

export async function POST(request: Request) {
  return handleCompletionPost(request);
}
