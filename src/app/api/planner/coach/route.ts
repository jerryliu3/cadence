import { NextResponse } from "next/server";
import {
  GeminiRequestError,
  generateGeminiJson,
} from "@/lib/ai/gemini";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getServerEnv } from "@/lib/env";
import { reportError } from "@/lib/observability/report-error";
import {
  consumePlannerAiQuota,
  readPlannerCoachQuotaLimit,
  shouldBypassPlannerCoachQuota,
} from "@/lib/planner/ai-quota";
import {
  coachRequestSchema,
  coachResponseJsonSchema,
  MAX_COACH_FOCUS_GOALS,
  sanitizeCoachTurn,
  type CoachSessionRosterEntry,
} from "@/lib/planner/coach";
import { buildCoachPrompt } from "@/lib/planner/coach-prompt";
import { loadPlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import { toKernelWindowFromDates } from "@/lib/planner/dates";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerAdminClient,
  requirePlannerRouteContext,
  resolveCanonicalAsOfDate,
  withPlannerRoute,
} from "@/lib/planner/api";
import { MAX_API_BODY_BYTES } from "@/lib/planner/contracts/bounds";

export const runtime = "nodejs";

const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_COACH_TIMEOUT_MS = 45_000;
const COACH_MAX_OUTPUT_TOKENS = 8_192;
const MAX_DEBUG_TEXT_LENGTH = 500;
const LOCAL_BYPASS_QUOTA_REMAINING = 999_999;
const COACH_RATE_LIMIT_PER_MINUTE = 30;
const NEEDS_GOAL_NO_EDITS_WARNING =
  "No calendar edits were generated because this plan does not map to an existing goal.";
const GOAL_DRAFT_PROMPT_BACKFILL_WARNING =
  "Coach did not return goal draft instructions, so draft generation was inferred from the conversation context.";

function includeCoachDebugDetails() {
  return process.env.NODE_ENV !== "production";
}

function truncateForDebug(value: string, maxLength = MAX_DEBUG_TEXT_LENGTH) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function summarizeCandidateJson(value: unknown) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).slice(0, 20);
    return `object(keys=${keys.join(",")})`;
  }
  return typeof value;
}

function safeDebugString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function logCoachError(
  stage: string,
  correlationId: string,
  payload: Record<string, unknown>
) {
  reportError(new Error(`planner-coach:${stage}`), {
    correlationId,
    code: "planner_coach_error",
    status: 500,
    stage,
    ...payload,
  });
  console.error("[planner-coach]", {
    stage,
    correlationId,
    ...payload,
  });
}

function readCoachTimeoutMs() {
  return getServerEnv().CALENDAR_COACH_TIMEOUT_MS ?? DEFAULT_COACH_TIMEOUT_MS;
}

function buildCoachSessionRoster({
  goalsById,
  items,
}: {
  goalsById: Map<string, { title: string }>;
  items: Array<{
    plan_goal_id: string;
    unit_key: string;
    scheduled_date: string | null;
  }>;
}): CoachSessionRosterEntry[] {
  return items
    .filter((item): item is typeof item & { scheduled_date: string } =>
      Boolean(item.scheduled_date)
    )
    .map((item, index) => ({
      sessionRef: `s${index + 1}`,
      goalId: item.plan_goal_id,
      goalTitle: goalsById.get(item.plan_goal_id)?.title ?? "Untitled goal",
      unitKey: item.unit_key,
      scheduledDate: item.scheduled_date,
    }));
}

function shouldBackfillGoalDraftPrompt(
  sanitized: ReturnType<typeof sanitizeCoachTurn>
) {
  return (
    sanitized.calendarIntentAction === "needs_goal" &&
    sanitized.goalDraftPromptMissing
  );
}

function buildFallbackGoalDraftPrompt({
  startDate,
  endDate,
  messages,
  reply,
  recommendations,
}: {
  startDate: string;
  endDate: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  reply: string;
  recommendations: Array<{ text: string }>;
}) {
  const recentUserMessages = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .slice(-4);
  const recommendationLines = recommendations
    .map((recommendation) => recommendation.text.trim())
    .filter(Boolean)
    .slice(0, 5);

  return [
    "Create 1-5 goal drafts from this plan request.",
    `Use absolute dates within ${startDate} to ${endDate}.`,
    'Use "fixed_milestones" with ordered milestone_names when sessions vary across a finite training plan.',
    'Use "recurring" only when sessions are fully interchangeable.',
    "User request and plan details:",
    ...recentUserMessages.map((line) => `- ${line}`),
    ...recommendationLines.map((line) => `- ${line}`),
    reply.trim() ? `Coach summary: ${reply.trim()}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export async function POST(request: Request) {
  const coachTimeoutMs = readCoachTimeoutMs();
  return withPlannerRoute(async ({ correlationId }) => {
    try {
      const routeContext = await requirePlannerRouteContext(request);

      const rate = checkRateLimit({
        key: `planner-coach:${routeContext.userId}`,
        limit: COACH_RATE_LIMIT_PER_MINUTE,
        windowMs: 60_000,
      });
      if (!rate.allowed) {
        return NextResponse.json(
          {
            code: "rate_limited",
            message: "Too many coach requests. Try again shortly.",
            correlationId,
          },
          {
            status: 429,
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": `${Math.ceil(rate.retryAfterMs / 1000)}`,
            },
          }
        );
      }

      const body = await parseBoundedJsonBody(
        request,
        Math.min(MAX_API_BODY_BYTES, 128 * 1024),
        coachRequestSchema
      );

      const snapshot = await loadPlannerCanonicalSnapshot({
        supabase: routeContext.supabase,
        ownerId: routeContext.userId,
        ...toKernelWindowFromDates({
          start: body.startDate,
          end: body.endDate,
        }),
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
          : snapshot.goals
              .slice(0, MAX_COACH_FOCUS_GOALS)
              .map((goal) => goal.id);
      const focusGoals = focusGoalIds
        .map((goalId) => goalsById.get(goalId))
        .filter((goal): goal is NonNullable<typeof goal> => Boolean(goal));
      const sessionRoster = buildCoachSessionRoster({
        goalsById,
        items: snapshot.activePlan?.items ?? [],
      });

      const admin = requirePlannerAdminClient();
      const prompt = buildCoachPrompt({
        startDate: body.startDate,
        endDate: body.endDate,
        timezone: effectiveTimezone,
        asOfDate,
        focusGoals,
        sessionRoster,
        allGoalsCount: snapshot.goals.length,
        deterministicSummary: body.deterministicSummary,
        messages: body.messages,
      });
      const estimatedInputTokens = Math.max(1, Math.ceil(prompt.length / 4));
      const bypassQuota = shouldBypassPlannerCoachQuota();
      let quota;
      if (bypassQuota) {
        quota = {
          usageDate: asOfDate,
          allowed: true,
          requestCount: 0,
          remaining: LOCAL_BYPASS_QUOTA_REMAINING,
          retryAfterSeconds: 0,
        };
      } else {
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

        quota = await consumePlannerAiQuota({
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
      }
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
          totalTimeoutMs: coachTimeoutMs,
          maxOutputTokens: COACH_MAX_OUTPUT_TOKENS,
          maxAttempts: 2,
          signal: request.signal,
        });
      } catch (error) {
        if (error instanceof GeminiRequestError) {
          logCoachError("provider", correlationId, {
            providerCode: error.code,
            retryable: error.retryable,
            providerMessage: truncateForDebug(error.message),
            promptChars: prompt.length,
            focusGoals: focusGoalIds.length,
          });
        } else {
          logCoachError("provider", correlationId, {
            providerCode: "unknown",
            providerMessage:
              error instanceof Error
                ? truncateForDebug(error.message)
                : "non-error thrown",
            promptChars: prompt.length,
            focusGoals: focusGoalIds.length,
          });
        }
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
          if (
            error.code === "invalid_response" ||
            error.code === "empty_response"
          ) {
            throw new PlannerRouteError(
              502,
              "ai_invalid_output",
              "Planner coach output was invalid.",
              includeCoachDebugDetails()
                ? {
                    stage: "provider",
                    providerCode: error.code,
                    providerMessage: truncateForDebug(error.message),
                  }
                : undefined
            );
          }
        }
        throw new PlannerRouteError(
          502,
          "ai_provider_error",
          "Planner coach request failed.",
          includeCoachDebugDetails()
            ? {
                stage: "provider",
                providerCode:
                  error instanceof GeminiRequestError ? error.code : "unknown",
                providerMessage:
                  error instanceof Error
                    ? truncateForDebug(error.message)
                    : "non-error thrown",
              }
            : undefined
        );
      }

      let sanitized;
      try {
        sanitized = sanitizeCoachTurn({
          raw: response.candidateJson,
          goalsById,
          sessionRoster,
        });
      } catch (error) {
        const candidateTextPreview = truncateForDebug(
          safeDebugString(response.candidateText ?? response.candidateJson)
        );
        logCoachError("sanitize", correlationId, {
          sanitizeMessage:
            error instanceof Error
              ? truncateForDebug(error.message)
              : "non-error thrown",
          candidateTextPreview,
          candidateJsonSummary: summarizeCandidateJson(response.candidateJson),
        });
        throw new PlannerRouteError(
          502,
          "ai_invalid_output",
          "Planner coach output was invalid.",
          includeCoachDebugDetails()
            ? {
                stage: "sanitize",
                sanitizeMessage:
                  error instanceof Error
                    ? truncateForDebug(error.message)
                    : "non-error thrown",
                candidateJsonSummary: summarizeCandidateJson(
                  response.candidateJson
                ),
                candidateTextPreview,
              }
            : undefined
        );
      }

      if (shouldBackfillGoalDraftPrompt(sanitized)) {
        const fallbackGoalDraftPrompt = buildFallbackGoalDraftPrompt({
          startDate: body.startDate,
          endDate: body.endDate,
          messages: body.messages,
          reply: sanitized.reply,
          recommendations: sanitized.recommendations,
        });
        sanitized = {
          ...sanitized,
          proposal: {
            ...sanitized.proposal,
            goalDraftPrompt: fallbackGoalDraftPrompt,
          },
          warnings: [
            ...sanitized.warnings.filter(
              (warning) => warning !== NEEDS_GOAL_NO_EDITS_WARNING
            ),
            GOAL_DRAFT_PROMPT_BACKFILL_WARNING,
          ],
        };
      }

      const {
        calendarIntentAction: _calendarIntentAction,
        goalDraftPromptMissing: _goalDraftPromptMissing,
        ...sanitizedForResponse
      } = sanitized;

      const responsePayload = {
        ...sanitizedForResponse,
        startDate: body.startDate,
        endDate: body.endDate,
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

      return NextResponse.json(responsePayload, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      if (error instanceof PlannerRouteError) {
        logCoachError("route", correlationId, {
          status: error.status,
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        });
      } else {
        logCoachError("route", correlationId, {
          status: 500,
          code: "internal_error",
          message:
            error instanceof Error
              ? truncateForDebug(error.message)
              : "non-error thrown",
        });
      }
      throw error;
    }
  });
}
