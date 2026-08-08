import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getDateInTimezone,
  isValidIanaTimezone,
} from "@/lib/dates/timezone";
import { requirePlannerAdminClient } from "@/lib/planner/api";
import { getPlannerCapabilities } from "@/lib/planner/capabilities";
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 16 * 1024;
const plannerItemExpectationSchema = z
  .object({
    itemId: z.string().uuid(),
    expectedCreditedUnit: z
      .object({
        goalId: z.string().min(1).max(100),
        requirementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        unitKey: z.string().min(1).max(100),
        completedOn: z.iso.date(),
      })
      .nullable(),
    expectedCanonicalRevision: z.number().int().nonnegative(),
    expectedExecutionRevision: z.number().int().nonnegative(),
    expectedItemRevision: z.number().int().nonnegative(),
  })
  .strict();

const plannerGoalExpectationSchema = z
  .object({
    planGoalId: z.string().uuid(),
    expectedCanonicalRevision: z.number().int().nonnegative(),
    expectedExecutionRevision: z.number().int().nonnegative(),
  })
  .strict();

const requestSchema = z
  .object({
    goalId: z.uuid(),
    date: z.iso.date(),
    desiredFactState: z.enum(["present", "absent"]),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isValidIanaTimezone, "Provide a valid IANA timezone."),
    plannerItemExpectation: plannerItemExpectationSchema.optional(),
    plannerGoalExpectation: plannerGoalExpectationSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      !(
        value.plannerItemExpectation !== undefined &&
        value.plannerGoalExpectation !== undefined
      ),
    {
      message: "Only one planner expectation can be supplied per request.",
      path: ["plannerGoalExpectation"],
    }
  );

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

  const parsedRequest = requestSchema.safeParse(parsedBody);
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
    const admin = requirePlannerAdminClient();
    const response = await callAdminRpc(
      admin,
      "set_execution_plan_item_date_fact_service",
      {
        p_owner: user.id,
        p_item_id: plannerItemExpectation.itemId,
        p_desired_fact_state: desiredFactState,
        p_expected_credited_unit: plannerItemExpectation.expectedCreditedUnit,
        p_expected_canonical_revision:
          plannerItemExpectation.expectedCanonicalRevision,
        p_expected_execution_revision:
          plannerItemExpectation.expectedExecutionRevision,
        p_expected_item_revision: plannerItemExpectation.expectedItemRevision,
      }
    );
    if (response.error) {
      const message = response.error.message.toLowerCase();
      if (
        message.includes("planner revision mismatch") ||
        message.includes("planner item revision mismatch") ||
        message.includes("credited unit mismatch")
      ) {
        emitTargetedCompletionTelemetry({
          ownerId: user.id,
          correlationId,
          capabilities,
          startedAt,
          route: "item_date",
          desiredFactState,
          statusCode: 409,
          errorCode: "stale_revision",
        });
        return errorResponse(
          409,
          "stale_revision",
          "Planner completion state is stale. Refresh and try again.",
          correlationId
        );
      }
      if (message.includes("future_completion_not_allowed")) {
        emitTargetedCompletionTelemetry({
          ownerId: user.id,
          correlationId,
          capabilities,
          startedAt,
          route: "item_date",
          desiredFactState,
          statusCode: 422,
          errorCode: "future_completion_not_allowed",
        });
        return errorResponse(
          422,
          "future_completion_not_allowed",
          "Completions can only be added for today or a past date.",
          correlationId
        );
      }
      if (message.includes("item state cannot accept exact-date facts")) {
        emitTargetedCompletionTelemetry({
          ownerId: user.id,
          correlationId,
          capabilities,
          startedAt,
          route: "item_date",
          desiredFactState,
          statusCode: 422,
          errorCode: "item_date_fact_disallowed",
        });
        return errorResponse(
          422,
          "item_date_fact_disallowed",
          "This item state cannot be updated with exact-date completion facts.",
          correlationId
        );
      }
      if (message.includes("active planner item not found")) {
        emitTargetedCompletionTelemetry({
          ownerId: user.id,
          correlationId,
          capabilities,
          startedAt,
          route: "item_date",
          desiredFactState,
          statusCode: 404,
          errorCode: "planner_item_not_found",
        });
        return errorResponse(
          404,
          "planner_item_not_found",
          "Planner item was not found in the active plan.",
          correlationId
        );
      }

      emitTargetedCompletionTelemetry({
        ownerId: user.id,
        correlationId,
        capabilities,
        startedAt,
        route: "item_date",
        desiredFactState,
        statusCode: 409,
        errorCode: "planner_item_date_fact_failed",
      });
      return errorResponse(
        409,
        "planner_item_date_fact_failed",
        "Planner item date fact could not be updated.",
        correlationId
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      emitTargetedCompletionTelemetry({
        ownerId: user.id,
        correlationId,
        capabilities,
        startedAt,
        route: "item_date",
        desiredFactState,
        statusCode: 500,
        errorCode: "invariant_failed",
      });
      return errorResponse(
        500,
        "invariant_failed",
        "Planner item date fact did not return updated state.",
        correlationId
      );
    }

    emitTargetedCompletionTelemetry({
      ownerId: user.id,
      correlationId,
      capabilities,
      startedAt,
      route: "item_date",
      desiredFactState,
      statusCode: 200,
      errorCode: null,
    });

    return NextResponse.json(
      {
        schemaVersion: "1",
        goalId: typeof row.goal_id === "string" ? row.goal_id : goalId,
        date: typeof row.date === "string" ? row.date : date,
        factState: row.fact_state as "present" | "absent",
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (plannerGoalExpectation) {
    const admin = requirePlannerAdminClient();
    const response = await callAdminRpc(
      admin,
      "set_execution_plan_goal_date_fact_service",
      {
        p_owner: user.id,
        p_plan_goal_id: plannerGoalExpectation.planGoalId,
        p_date: date,
        p_desired_fact_state: desiredFactState,
        p_expected_canonical_revision:
          plannerGoalExpectation.expectedCanonicalRevision,
        p_expected_execution_revision:
          plannerGoalExpectation.expectedExecutionRevision,
      }
    );
    if (response.error) {
      const message = response.error.message.toLowerCase();
      if (message.includes("planner revision mismatch")) {
        emitTargetedCompletionTelemetry({
          ownerId: user.id,
          correlationId,
          capabilities,
          startedAt,
          route: "plan_goal_date",
          desiredFactState,
          statusCode: 409,
          errorCode: "stale_revision",
        });
        return errorResponse(
          409,
          "stale_revision",
          "Planner completion state is stale. Refresh and try again.",
          correlationId
        );
      }
      if (message.includes("future_completion_not_allowed")) {
        emitTargetedCompletionTelemetry({
          ownerId: user.id,
          correlationId,
          capabilities,
          startedAt,
          route: "plan_goal_date",
          desiredFactState,
          statusCode: 422,
          errorCode: "future_completion_not_allowed",
        });
        return errorResponse(
          422,
          "future_completion_not_allowed",
          "Completions can only be added for today or a past date.",
          correlationId
        );
      }
      if (message.includes("completion_outside_goal_lifetime")) {
        emitTargetedCompletionTelemetry({
          ownerId: user.id,
          correlationId,
          capabilities,
          startedAt,
          route: "plan_goal_date",
          desiredFactState,
          statusCode: 422,
          errorCode: "completion_outside_goal_lifetime",
        });
        return errorResponse(
          422,
          "completion_outside_goal_lifetime",
          "The completion date must be within the goal lifetime.",
          correlationId
        );
      }
      if (message.includes("linked goals cannot use planner plan-goal date facts")) {
        emitTargetedCompletionTelemetry({
          ownerId: user.id,
          correlationId,
          capabilities,
          startedAt,
          route: "plan_goal_date",
          desiredFactState,
          statusCode: 422,
          errorCode: "linked_goal_disallowed",
        });
        return errorResponse(
          422,
          "linked_goal_disallowed",
          "Linked goals cannot be completed through plan-goal date facts.",
          correlationId
        );
      }
      if (message.includes("active planner goal not found")) {
        emitTargetedCompletionTelemetry({
          ownerId: user.id,
          correlationId,
          capabilities,
          startedAt,
          route: "plan_goal_date",
          desiredFactState,
          statusCode: 404,
          errorCode: "planner_goal_not_found",
        });
        return errorResponse(
          404,
          "planner_goal_not_found",
          "Planner goal was not found in the active plan.",
          correlationId
        );
      }

      emitTargetedCompletionTelemetry({
        ownerId: user.id,
        correlationId,
        capabilities,
        startedAt,
        route: "plan_goal_date",
        desiredFactState,
        statusCode: 409,
        errorCode: "planner_goal_date_fact_failed",
      });
      return errorResponse(
        409,
        "planner_goal_date_fact_failed",
        "Planner goal date fact could not be updated.",
        correlationId
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      emitTargetedCompletionTelemetry({
        ownerId: user.id,
        correlationId,
        capabilities,
        startedAt,
        route: "plan_goal_date",
        desiredFactState,
        statusCode: 500,
        errorCode: "invariant_failed",
      });
      return errorResponse(
        500,
        "invariant_failed",
        "Planner goal date fact did not return updated state.",
        correlationId
      );
    }

    emitTargetedCompletionTelemetry({
      ownerId: user.id,
      correlationId,
      capabilities,
      startedAt,
      route: "plan_goal_date",
      desiredFactState,
      statusCode: 200,
      errorCode: null,
    });

    return NextResponse.json(
      {
        schemaVersion: "1",
        goalId: typeof row.goal_id === "string" ? row.goal_id : goalId,
        date: typeof row.date === "string" ? row.date : date,
        factState: row.fact_state as "present" | "absent",
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
