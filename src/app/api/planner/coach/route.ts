import { NextResponse } from "next/server";
import {
  GeminiRequestError,
  generateGeminiJson,
} from "@/lib/ai/gemini";
import {
  consumePlannerAiQuota,
  readPlannerCoachQuotaLimit,
  recordPlannerAiOutputTokens,
} from "@/lib/planner/ai-quota";
import {
  coachRequestSchema,
  coachResponseJsonSchema,
  sanitizeCoachTurn,
} from "@/lib/planner/coach";
import { buildCoachPrompt } from "@/lib/planner/coach-prompt";
import { loadPlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerAdminClient,
  requirePlannerRouteContext,
  resolveCanonicalAsOfDate,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { MAX_API_BODY_BYTES } from "@/lib/planner/contracts/bounds";
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_RESPONSE_BYTES = 256 * 1024;
const COACH_TIMEOUT_MS = 15_000;

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();
  let telemetryOwnerId: string | null = null;
  let telemetryCapabilities:
    | Awaited<ReturnType<typeof requirePlannerRouteContext>>["capabilities"]
    | null = null;
  let telemetryInputBytes = 0;
  let aiTelemetryEmitted = false;
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "coachAi",
      disabledCode: "planner_coach_disabled",
      disabledMessage: "Planner coach is not enabled.",
    });
    telemetryOwnerId = routeContext.userId;
    telemetryCapabilities = routeContext.capabilities;

    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      coachRequestSchema
    );
    telemetryInputBytes = Buffer.byteLength(JSON.stringify(body), "utf8");

    const snapshot = await loadPlannerCanonicalSnapshot({
      supabase: routeContext.supabase,
      ownerId: routeContext.userId,
      scopeMonth: body.scopeMonth,
    });
    if (!snapshot.preferences) {
      throw new PlannerRouteError(
        422,
        "timezone_confirmation_required",
        "Confirm planner timezone before using AI coach."
      );
    }

    const effectiveTimezone = snapshot.preferences.timezone;
    const asOfDate = resolveCanonicalAsOfDate({
      timezone: effectiveTimezone,
    });

    const goalsById = new Map(snapshot.goals.map((goal) => [goal.id, goal]));
    const focusGoalIds =
      body.focusGoalIds.length > 0
        ? body.focusGoalIds.filter((goalId) => goalsById.has(goalId))
        : snapshot.goals.slice(0, 20).map((goal) => goal.id);
    const focusGoals = focusGoalIds
      .map((goalId) => goalsById.get(goalId))
      .filter((goal): goal is NonNullable<typeof goal> => Boolean(goal));

    let quotaLimit: number;
    try {
      quotaLimit = readPlannerCoachQuotaLimit();
    } catch {
      throw new PlannerRouteError(
        503,
        "capability_configuration_invalid",
        "Planner coach is temporarily unavailable."
      );
    }

    const admin = requirePlannerAdminClient();
    const prompt = buildCoachPrompt({
      scopeMonth: body.scopeMonth,
      timezone: effectiveTimezone,
      asOfDate,
      focusGoals,
      allGoalsCount: snapshot.goals.length,
      deterministicSummary: body.deterministicSummary,
      messages: body.messages,
    });
    const estimatedInputTokens = Math.max(1, Math.ceil(prompt.length / 4));
    const quota = await consumePlannerAiQuota({
      admin,
      ownerId: routeContext.userId,
      feature: "planner_coach",
      limit: quotaLimit,
      estimatedInputTokens,
    }).catch(() => {
      throw new PlannerRouteError(
        503,
        "quota_check_failed",
        "Planner coach is temporarily unavailable."
      );
    });
    if (!quota.allowed) {
      emitTelemetryEvent({
        eventName: "ai.request.completed",
        ownerId: routeContext.userId,
        correlationId,
        capabilities: routeContext.capabilities,
        scope: null,
        result: "quota_rejected",
        statusCode: 429,
        errorCode: "quota_exceeded",
        durationMs: Date.now() - startedAt,
        counts: {
          chatMessages: body.messages.length,
          inputBytes: telemetryInputBytes,
          outputBytes: 0,
          providerAttempts: 0,
        },
        versions: { prompt: "planner-coach-v1" },
        data: {
          feature: "planner_coach",
          provider: "gemini",
          attempt: 1,
        },
      });
      aiTelemetryEmitted = true;
      return NextResponse.json(
        {
          code: "quota_exceeded",
          message: "Daily planner coach limit reached.",
          correlationId,
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": `${quota.retryAfterSeconds}`,
          },
        }
      );
    }

    let response;
    try {
      response = await generateGeminiJson({
        prompt,
        responseSchema: coachResponseJsonSchema as unknown as Record<string, unknown>,
        maxResponseBytes: MAX_RESPONSE_BYTES,
        totalTimeoutMs: COACH_TIMEOUT_MS,
        maxAttempts: 2,
        signal: request.signal,
      });
    } catch (error) {
      const statusCode =
        error instanceof GeminiRequestError && error.code === "timeout"
          ? 504
          : 502;
      const errorCode =
        error instanceof GeminiRequestError && error.code === "timeout"
          ? "ai_timeout"
          : error instanceof GeminiRequestError &&
              error.code === "response_too_large"
            ? "ai_response_too_large"
            : error instanceof GeminiRequestError &&
                (error.code === "invalid_response" ||
                  error.code === "empty_response")
              ? "ai_invalid_output"
              : "ai_provider_error";
      emitTelemetryEvent({
        eventName: "ai.request.completed",
        ownerId: routeContext.userId,
        correlationId,
        capabilities: routeContext.capabilities,
        scope: null,
        result: classifyTelemetryResult({
          statusCode,
          errorCode,
        }),
        statusCode,
        errorCode,
        durationMs: Date.now() - startedAt,
        counts: {
          chatMessages: body.messages.length,
          inputBytes: telemetryInputBytes,
          outputBytes: 0,
          providerAttempts: 1,
        },
        versions: { prompt: "planner-coach-v1" },
        data: {
          feature: "planner_coach",
          provider: "gemini",
          attempt: 1,
        },
      });
      aiTelemetryEmitted = true;
      if (error instanceof GeminiRequestError) {
        if (error.code === "timeout") {
          throw new PlannerRouteError(
            504,
            "ai_timeout",
            "Planner coach timed out. Try again."
          );
        }
        if (error.code === "response_too_large") {
          throw new PlannerRouteError(
            502,
            "ai_response_too_large",
            "Planner coach returned too much data."
          );
        }
        if (error.code === "invalid_response" || error.code === "empty_response") {
          throw new PlannerRouteError(
            502,
            "ai_invalid_output",
            "Planner coach output was invalid."
          );
        }
      }
      throw new PlannerRouteError(
        502,
        "ai_provider_error",
        "Planner coach request failed."
      );
    }

    let sanitized;
    try {
      sanitized = sanitizeCoachTurn({
        raw: response.candidateJson,
        goalsById,
      });
    } catch {
      throw new PlannerRouteError(
        502,
        "ai_invalid_output",
        "Planner coach output was invalid."
      );
    }

    await recordPlannerAiOutputTokens({
      admin,
      ownerId: routeContext.userId,
      usageDate: quota.usageDate,
      feature: "planner_coach",
      outputTokens: response.outputTokens,
    }).catch(() => undefined);

    const responsePayload = {
      ...sanitized,
      scopeMonth: body.scopeMonth,
      asOfDate,
      timezone: effectiveTimezone,
      focusGoalIds,
      quota: {
        usageDate: quota.usageDate,
        remaining: quota.remaining,
        requestCount: quota.requestCount,
        retryAfterSeconds: quota.retryAfterSeconds,
      },
      correlationId,
    };

    emitTelemetryEvent({
      eventName: "ai.request.completed",
      ownerId: routeContext.userId,
      correlationId,
      capabilities: routeContext.capabilities,
      scope: null,
      result: "success",
      statusCode: 200,
      errorCode: null,
      durationMs: Date.now() - startedAt,
      counts: {
        chatMessages: body.messages.length,
        inputBytes: telemetryInputBytes,
        outputBytes: Buffer.byteLength(JSON.stringify(responsePayload), "utf8"),
        providerAttempts: response.attempts,
      },
      versions: { prompt: "planner-coach-v1" },
      data: {
        feature: "planner_coach",
        provider: "gemini",
        attempt: response.attempts,
      },
    });
    aiTelemetryEmitted = true;

    return NextResponse.json(
      responsePayload,
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      if (
        telemetryOwnerId &&
        telemetryCapabilities &&
        !aiTelemetryEmitted
      ) {
        emitTelemetryEvent({
          eventName: "ai.request.completed",
          ownerId: telemetryOwnerId,
          correlationId,
          capabilities: telemetryCapabilities,
          scope: null,
          result: classifyTelemetryResult({
            statusCode: error.status,
            errorCode: error.code,
          }),
          statusCode: error.status,
          errorCode: error.code,
          durationMs: Date.now() - startedAt,
          counts: {
            chatMessages: 0,
            inputBytes: telemetryInputBytes,
            outputBytes: 0,
            providerAttempts: 0,
          },
          versions: { prompt: "planner-coach-v1" },
          data: {
            feature: "planner_coach",
            provider: "gemini",
            attempt: 1,
          },
        });
      }
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
