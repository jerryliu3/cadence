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
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_RESPONSE_BYTES = 256 * 1024;
const COACH_TIMEOUT_MS = 15_000;

function buildCoachPrompt({
  scopeMonth,
  timezone,
  asOfDate,
  focusGoals,
  allGoalsCount,
  deterministicSummary,
  messages,
}: {
  scopeMonth: string;
  timezone: string;
  asOfDate: string;
  focusGoals: Array<{
    id: string;
    title: string;
    category: string;
    start_date: string;
    end_date: string | null;
    frequency_type: "fixed_milestones" | "recurring";
    recurrence_interval: "daily" | "weekly" | "monthly" | null;
    target_count: number | null;
  }>;
  allGoalsCount: number;
  deterministicSummary?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const focusGoalsJson = JSON.stringify(
    focusGoals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      category: goal.category,
      startDate: goal.start_date,
      endDate: goal.end_date,
      frequencyType: goal.frequency_type,
      recurrenceInterval: goal.recurrence_interval,
      targetCount: goal.target_count,
    }))
  );

  return [
    "You are a planner coach assistant.",
    "Return only JSON. Do not use markdown fences.",
    'Schema: {"schemaVersion":"1","phase":"discovery|review|ready|explain","reply":"...","proposal":{"assessments":[],"policyPatches":[],"unresolvedQuestions":[]},"recommendations":[{"text":"..."}]}',
    "Supported policy patch kinds only:",
    "- set_rest_weekdays",
    "- add_blackout_range",
    "- remove_blackout_range",
    "- set_goal_allowed_weekdays",
    "- clear_goal_allowed_weekdays",
    "- set_goal_date_preference",
    "- clear_goal_date_preference",
    "- set_spacing_strategy",
    "Never include unsupported patch kinds.",
    "Assessments must target only the listed focus goals.",
    `Context month: ${scopeMonth}`,
    `Context as-of date: ${asOfDate}`,
    `Confirmed timezone: ${timezone}`,
    `Total owner goals in context: ${allGoalsCount}`,
    deterministicSummary ? `Deterministic summary: ${deterministicSummary}` : null,
    `Focus goals JSON: ${focusGoalsJson}`,
    "Conversation transcript (latest last):",
    ...messages.map(
      (message) => `${message.role.toUpperCase()}: ${message.content}`
    ),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "coachAi",
      disabledCode: "planner_coach_disabled",
      disabledMessage: "Planner coach is not enabled.",
    });

    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      coachRequestSchema
    );

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

    const sanitized = sanitizeCoachTurn({
      raw: response.candidateJson,
      goalsById,
    });

    await recordPlannerAiOutputTokens({
      admin,
      ownerId: routeContext.userId,
      usageDate: quota.usageDate,
      feature: "planner_coach",
      outputTokens: response.outputTokens,
    }).catch(() => undefined);

    return NextResponse.json(
      {
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
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
