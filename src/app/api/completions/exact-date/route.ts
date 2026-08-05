import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getDateInTimezone,
  isValidIanaTimezone,
} from "@/lib/dates/timezone";
import { getPlannerCapabilities } from "@/lib/planner/capabilities";
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 16 * 1024;
const requestSchema = z.object({
  goalId: z.uuid(),
  date: z.iso.date(),
  desiredFactState: z.enum(["present", "absent"]),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidIanaTimezone, "Provide a valid IANA timezone."),
});

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

  const parsedRequest = requestSchema.safeParse(parsedBody);
  if (!parsedRequest.success) {
    return errorResponse(
      400,
      "validation_failed",
      "Provide a goal, date, desired state, and valid timezone.",
      correlationId
    );
  }

  const { goalId, date, desiredFactState, timezone } = parsedRequest.data;
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, frequency_type, target_count, start_date, end_date")
    .eq("id", goalId)
    .maybeSingle();

  if (
    goalError ||
    !goal ||
    goal.frequency_type !== "recurring" ||
    typeof goal.target_count !== "number" ||
    goal.target_count <= 0
  ) {
    return errorResponse(
      404,
      "targeted_goal_not_found",
      "The targeted recurring goal was not found.",
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
    const response = errorResponse(
      409,
      "completion_update_failed",
      "The completion could not be updated.",
      correlationId
    );
    emitTelemetryEvent({
      eventName: "targeted_completion.completed",
      ownerId: user.id,
      correlationId,
      capabilities,
      scope: null,
      result: classifyTelemetryResult({
        statusCode: 409,
        errorCode: "completion_update_failed",
      }),
      statusCode: 409,
      errorCode: "completion_update_failed",
      durationMs: Date.now() - startedAt,
      data: {
        route: "canonical_exact_date",
        desiredFactState,
      },
    });
    return response;
  }

  emitTelemetryEvent({
    eventName: "targeted_completion.completed",
    ownerId: user.id,
    correlationId,
    capabilities,
    scope: null,
    result: "success",
    statusCode: 200,
    errorCode: null,
    durationMs: Date.now() - startedAt,
    data: {
      route: "canonical_exact_date",
      desiredFactState,
    },
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
