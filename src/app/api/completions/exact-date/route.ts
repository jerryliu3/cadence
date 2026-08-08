import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getDateInTimezone,
} from "@/lib/dates/timezone";
import { getPlannerCapabilities } from "@/lib/planner/capabilities";
import {
  applyPlannerGoalDateFact,
  applyPlannerItemDateFact,
  targetedExactDateRequestSchema,
} from "@/lib/planner/exact-date-dispatch";
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
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

type TargetedCompletionRoute = "item_date" | "plan_goal_date" | "canonical_exact_date";

function emitTargetedCompletionTelemetry({
  ownerId,
  correlationId,
  capabilities,
  startedAt,
  route,
  desiredFactState,
  statusCode,
  errorCode,
}: {
  ownerId: string;
  correlationId: string;
  capabilities: ReturnType<typeof getPlannerCapabilities>;
  startedAt: number;
  route: TargetedCompletionRoute;
  desiredFactState: "present" | "absent";
  statusCode: number;
  errorCode: string | null;
}) {
  emitTelemetryEvent({
    eventName: "targeted_completion.completed",
    ownerId,
    correlationId,
    capabilities,
    scope: null,
    result: errorCode
      ? classifyTelemetryResult({
          statusCode,
          errorCode,
        })
      : "success",
    statusCode,
    errorCode,
    durationMs: Date.now() - startedAt,
    data: {
      route,
      desiredFactState,
    },
  });
}

export async function POST(request: Request) {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse(
      401,
      "authentication_required",
      "Sign in to update goal completions.",
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
  if (!capabilities.targetedExactCompletion) {
    const response = errorResponse(
      503,
      "targeted_exact_completion_disabled",
      "Exact-date completion updates are temporarily unavailable.",
      correlationId
    );
    emitTelemetryEvent({
      eventName: "targeted_completion.completed",
      ownerId: user.id,
      correlationId,
      capabilities,
      scope: null,
      result: "disabled",
      statusCode: 503,
      errorCode: "targeted_exact_completion_disabled",
      durationMs: Date.now() - startedAt,
      data: {
        route: "canonical_exact_date",
        desiredFactState: "absent",
      },
    });
    return response;
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(
      413,
      "request_too_large",
      "The request body is too large.",
      correlationId
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
    return errorResponse(
      413,
      "request_too_large",
      "The request body is too large.",
      correlationId
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
      correlationId
    );
  }

  const parsedRequest = targetedExactDateRequestSchema.safeParse(parsedBody);
  if (!parsedRequest.success) {
    return errorResponse(
      400,
      "validation_failed",
      "Provide a goal, date, desired state, and valid timezone.",
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
  } = parsedRequest.data;

  if (plannerItemExpectation) {
    const result = await applyPlannerItemDateFact({
      ownerId: user.id,
      fallbackGoalId: goalId,
      fallbackDate: date,
      desiredFactState,
      expectation: plannerItemExpectation,
    });
    if (!result.ok) {
      emitTargetedCompletionTelemetry({
        ownerId: user.id,
        correlationId,
        capabilities,
        startedAt,
        route: result.route,
        desiredFactState,
        statusCode: result.status,
        errorCode: result.code,
      });
      return errorResponse(
        result.status,
        result.code,
        result.message,
        correlationId
      );
    }

    emitTargetedCompletionTelemetry({
      ownerId: user.id,
      correlationId,
      capabilities,
      startedAt,
      route: result.route,
      desiredFactState,
      statusCode: 200,
      errorCode: null,
    });

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
      ownerId: user.id,
      fallbackGoalId: goalId,
      fallbackDate: date,
      desiredFactState,
      expectation: plannerGoalExpectation,
    });
    if (!result.ok) {
      emitTargetedCompletionTelemetry({
        ownerId: user.id,
        correlationId,
        capabilities,
        startedAt,
        route: result.route,
        desiredFactState,
        statusCode: result.status,
        errorCode: result.code,
      });
      return errorResponse(
        result.status,
        result.code,
        result.message,
        correlationId
      );
    }

    emitTargetedCompletionTelemetry({
      ownerId: user.id,
      correlationId,
      capabilities,
      startedAt,
      route: result.route,
      desiredFactState,
      statusCode: 200,
      errorCode: null,
    });

    return NextResponse.json(
      {
        schemaVersion: "1",
        ...result.payload,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

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
    emitTargetedCompletionTelemetry({
      ownerId: user.id,
      correlationId,
      capabilities,
      startedAt,
      route: "canonical_exact_date",
      desiredFactState,
      statusCode: 409,
      errorCode: "completion_update_failed",
    });
    return errorResponse(
      409,
      "completion_update_failed",
      "The completion could not be updated.",
      correlationId
    );
  }

  emitTargetedCompletionTelemetry({
    ownerId: user.id,
    correlationId,
    capabilities,
    startedAt,
    route: "canonical_exact_date",
    desiredFactState,
    statusCode: 200,
    errorCode: null,
  });

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
