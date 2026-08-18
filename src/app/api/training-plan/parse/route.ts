import { NextResponse } from "next/server";
import { z } from "zod";
import { GeminiRequestError, generateGeminiJson } from "@/lib/ai/gemini";
import { checkRateLimit } from "@/lib/api/rate-limit";
import {
  ApiRouteError,
  parseJsonBody,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import { getServerEnv } from "@/lib/env";
import { DEFAULT_GOAL_CATEGORIES, resolveCategoryKey } from "@/lib/goals/category";
import { validateGoalDefinition } from "@/lib/goals/definition-validation";
import { MAX_GOAL_TARGET_COUNT } from "@/lib/planner/contracts/bounds";
import {
  consumePlannerAiQuota,
  readBulkParserQuotaLimit,
} from "@/lib/planner/ai-quota";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 48 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const PROVIDER_TIMEOUT_MS = 15_000;
const MAX_PROVIDER_ATTEMPTS = 2;
const TRAINING_PLAN_RATE_LIMIT_PER_MINUTE = 12;
const MAX_GOALS_PER_PLAN = 60;
const MAX_SESSIONS_PER_GOAL = 366;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const INVALID_ARGUMENT_PROVIDER_RE = /\(400\)|INVALID_ARGUMENT/i;

const requestSchema = z.object({
  planText: z.string().trim().min(1).max(12000),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidIanaTimezone, "Provide a valid IANA timezone."),
});

type GeneratedSession = {
  scheduled_date?: string;
  scheduled_time?: string | null;
};

type GeneratedGoal = {
  title: string;
  description?: string;
  category?: string;
  category_key?: string;
  frequency_type?: "recurring" | "fixed_milestones";
  recurrence_interval?: "daily" | "weekly" | "monthly";
  target_count?: number | null;
  start_date?: string;
  end_date?: string | null;
  default_local_time?: string | null;
  sessions?: GeneratedSession[];
};

type GeneratedPayload = {
  goals: GeneratedGoal[];
};

function buildGeneratedPayloadSchema(categoryKeySet: Set<string>) {
  const generatedSessionSchema = z.object({
    scheduled_date: z.string().optional(),
    scheduled_time: z.string().nullable().optional(),
  });
  const generatedGoalSchema = z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    category_key: z
      .string()
      .trim()
      .refine((value) => categoryKeySet.has(value), "category_key must be known")
      .optional(),
    frequency_type: z.enum(["recurring", "fixed_milestones"]).optional(),
    recurrence_interval: z.enum(["daily", "weekly", "monthly"]).optional(),
    target_count: z
      .number()
      .int()
      .positive()
      .max(MAX_GOAL_TARGET_COUNT)
      .nullable()
      .optional(),
    start_date: z.string().optional(),
    end_date: z.string().nullable().optional(),
    default_local_time: z.string().nullable().optional(),
    sessions: z.array(generatedSessionSchema).max(MAX_SESSIONS_PER_GOAL).optional(),
  });
  return z.object({
    goals: z.array(generatedGoalSchema).max(MAX_GOALS_PER_PLAN),
  });
}

function buildTrainingPlanResponseSchema(categoryKeys: string[]) {
  return {
    type: "object",
    properties: {
      goals: {
        type: "array",
        maxItems: MAX_GOALS_PER_PLAN,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            category_key: {
              type: "string",
              enum: categoryKeys,
            },
            frequency_type: {
              type: "string",
              enum: ["recurring", "fixed_milestones"],
            },
            recurrence_interval: {
              type: "string",
              enum: ["daily", "weekly", "monthly"],
            },
            target_count: { type: "number", maximum: MAX_GOAL_TARGET_COUNT },
            start_date: { type: "string" },
            end_date: { type: "string" },
            default_local_time: { type: "string" },
            sessions: {
              type: "array",
              maxItems: MAX_SESSIONS_PER_GOAL,
              items: {
                type: "object",
                properties: {
                  scheduled_date: { type: "string" },
                  scheduled_time: { type: "string" },
                },
                required: ["scheduled_date"],
              },
            },
          },
          required: ["title"],
        },
      },
    },
    required: ["goals"],
  } as const;
}

function toIsoDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return z.iso.date().safeParse(trimmed).success ? trimmed : undefined;
}

function normalizeLocalTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (localTimePattern.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }
  const candidate = `${match[1].padStart(2, "0")}:${match[2]}`;
  return localTimePattern.test(candidate) ? candidate : null;
}

function buildPrompt(planText: string, today: string, categoryKeys: string[]) {
  return [
    "Convert the user-provided training plan text into structured goals plus dated sessions.",
    "Return only JSON with no markdown fences and no prose.",
    'The JSON shape must be: {"goals":[{...}]}',
    "Each goal object can include these keys:",
    '- "title" (required string)',
    '- "description" (optional string)',
    '- "category" (optional string)',
    `- "category_key" (${categoryKeys.join(" | ")})`,
    '- "frequency_type" ("recurring" | "fixed_milestones")',
    '- "recurrence_interval" ("daily" | "weekly" | "monthly")',
    '- "target_count" (positive integer or null)',
    '- "start_date" (YYYY-MM-DD)',
    '- "end_date" (YYYY-MM-DD or null)',
    '- "default_local_time" (HH:MM or null)',
    '- "sessions" (array of { scheduled_date: YYYY-MM-DD, scheduled_time: HH:MM|null })',
    "",
    "Rules:",
    `- If a goal is missing start_date, use ${today} unless sessions imply an earlier date.`,
    "- Keep each goal's sessions grouped under that goal.",
    "- Include only sessions with explicit calendar dates.",
    '- If frequency is missing, default to "recurring".',
    '- If recurrence interval is missing for recurring goals, default to "weekly".',
    "- If fixed_milestones and target_count is missing, infer target_count from session count.",
    "- If end_date is missing and sessions exist, use the latest session date.",
    `- Return at most ${MAX_GOALS_PER_PLAN} goals.`,
    "",
    "User training plan:",
    planText,
  ].join("\n");
}

function shouldRetryWithoutResponseSchema(error: GeminiRequestError) {
  if (error.code !== "provider_error") {
    return false;
  }
  return INVALID_ARGUMENT_PROVIDER_RE.test(error.message);
}

async function readCategoryCatalog(
  supabase: Awaited<ReturnType<typeof requireAuthenticatedRequestContext>>["supabase"]
) {
  const fallback = DEFAULT_GOAL_CATEGORIES;
  const { data, error } = await supabase
    .from("goal_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error || !Array.isArray(data) || data.length === 0) {
    return fallback;
  }
  return data.map((category) => ({
    key: category.key,
    label: category.label,
    aliases: category.aliases ?? [],
    color: category.color,
    sortOrder: category.sort_order,
  }));
}

function normalizeGeneratedPayload(
  payload: GeneratedPayload,
  today: string,
  categoryCatalog: typeof DEFAULT_GOAL_CATEGORIES
) {
  const warnings: string[] = [];
  const goals = payload.goals.map((goal, index) => {
    const normalizedSessions = (goal.sessions ?? [])
      .flatMap((session) => {
        const scheduledDate = toIsoDate(session.scheduled_date);
        if (!scheduledDate) {
          return [];
        }
        return [
          {
            scheduled_date: scheduledDate,
            scheduled_time: normalizeLocalTime(session.scheduled_time),
          },
        ];
      })
      .sort((left, right) => left.scheduled_date.localeCompare(right.scheduled_date));
    const uniqueSessions = Array.from(
      new Map(
        normalizedSessions.map((session) => [session.scheduled_date, session])
      ).values()
    );

    const frequency = goal.frequency_type ?? "recurring";
    const recurrence =
      frequency === "recurring"
        ? goal.recurrence_interval ?? "weekly"
        : null;
    const startDate =
      toIsoDate(goal.start_date) ?? uniqueSessions[0]?.scheduled_date ?? today;
    const inferredEndDate = uniqueSessions.at(-1)?.scheduled_date ?? null;
    const endDate = toIsoDate(goal.end_date ?? undefined) ?? inferredEndDate;
    const targetCount =
      goal.target_count ??
      (frequency === "fixed_milestones" ? uniqueSessions.length || null : null);
    const normalized = {
      title: goal.title.trim(),
      description: goal.description?.trim() ?? "",
      category: goal.category?.trim() ?? "Health",
      category_key: goal.category_key
        ? goal.category_key
        : resolveCategoryKey(goal.category?.trim() ?? "Health", categoryCatalog),
      frequency_type: frequency,
      recurrence_interval: recurrence,
      target_count: targetCount,
      start_date: startDate,
      end_date: endDate,
      default_local_time: normalizeLocalTime(goal.default_local_time),
      sessions: uniqueSessions,
    };
    if (goal.sessions && goal.sessions.length !== uniqueSessions.length) {
      warnings.push(
        `Draft ${index + 1} (${normalized.title}): dropped sessions missing a valid YYYY-MM-DD date.`
      );
    }
    if (uniqueSessions.length === 0) {
      warnings.push(
        `Draft ${index + 1} (${normalized.title}): no dated sessions were detected.`
      );
    }
    const validationIssues = validateGoalDefinition({
      frequencyType: normalized.frequency_type,
      targetCount: normalized.target_count,
      startDate: normalized.start_date,
      endDate: normalized.end_date,
    });
    if (validationIssues.length > 0) {
      warnings.push(
        `Draft ${index + 1} (${normalized.title}): ${validationIssues[0]!.message}`
      );
    }
    return normalized;
  });
  return { goals, warnings };
}

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { supabase, userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to parse training plans.",
    });

    const rate = checkRateLimit({
      key: `training-plan-parse:${userId}`,
      limit: TRAINING_PLAN_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        {
          code: "rate_limited",
          message: "Too many training-plan parse requests. Try again shortly.",
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

    const parsedRequest = await parseJsonBody({
      request,
      maxBytes: MAX_REQUEST_BYTES,
      schema: requestSchema,
    }).catch((error) => {
      if (error instanceof ApiRouteError && error.code === "validation_failed") {
        throw new ApiRouteError(
          400,
          "validation_failed",
          "Provide non-empty training-plan text and a valid IANA timezone.",
          error.details
        );
      }
      throw error;
    });

    let quotaLimit: number;
    try {
      quotaLimit = readBulkParserQuotaLimit();
    } catch {
      throw new ApiRouteError(
        503,
        "capability_configuration_invalid",
        "Training-plan parsing is temporarily unavailable."
      );
    }

    const apiKey = getServerEnv().GEMINI_API_KEY;
    if (!apiKey) {
      throw new ApiRouteError(
        503,
        "ai_unavailable",
        "Training-plan parsing is temporarily unavailable."
      );
    }

    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch {
      throw new ApiRouteError(
        503,
        "admin_configuration_invalid",
        "Training-plan parsing is temporarily unavailable."
      );
    }

    const categoryCatalog = await readCategoryCatalog(supabase);
    const categoryKeys = categoryCatalog.map((category) => category.key);
    const categoryKeySet = new Set(categoryKeys);
    const generatedPayloadSchema = buildGeneratedPayloadSchema(categoryKeySet);
    const responseSchema = buildTrainingPlanResponseSchema(categoryKeys);

    const today = getDateInTimezone(new Date(), parsedRequest.timezone);
    const estimatedInputTokens = Math.max(
      1,
      Math.ceil(parsedRequest.planText.length / 4)
    );
    const quota = await consumePlannerAiQuota({
      admin,
      ownerId: userId,
      feature: "bulk_parser",
      limit: quotaLimit,
      estimatedInputTokens,
    }).catch(() => {
      throw new ApiRouteError(
        503,
        "quota_check_failed",
        "Training-plan parsing is temporarily unavailable."
      );
    });

    if (!quota.allowed) {
      return NextResponse.json(
        {
          code: "quota_exceeded",
          message: "Daily training-plan parse limit reached.",
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

    const prompt = buildPrompt(parsedRequest.planText, today, categoryKeys);
    let candidateJson: unknown;
    try {
      let result: Awaited<ReturnType<typeof generateGeminiJson>>;
      try {
        result = await generateGeminiJson({
          apiKey,
          prompt,
          responseSchema: responseSchema as unknown as Record<string, unknown>,
          maxResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
          totalTimeoutMs: PROVIDER_TIMEOUT_MS,
          maxAttempts: MAX_PROVIDER_ATTEMPTS,
          signal: request.signal,
        });
      } catch (error) {
        if (error instanceof GeminiRequestError && shouldRetryWithoutResponseSchema(error)) {
          result = await generateGeminiJson({
            apiKey,
            prompt,
            maxResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
            totalTimeoutMs: PROVIDER_TIMEOUT_MS,
            maxAttempts: MAX_PROVIDER_ATTEMPTS,
            signal: request.signal,
          });
        } else {
          throw error;
        }
      }
      candidateJson = result.candidateJson;
    } catch (error) {
      if (error instanceof GeminiRequestError) {
        if (error.code === "timeout") {
          throw new ApiRouteError(
            504,
            "ai_timeout",
            "Training-plan parsing timed out. Try again.",
            undefined,
            error
          );
        }
        if (error.code === "response_too_large") {
          throw new ApiRouteError(
            502,
            "ai_response_too_large",
            "Training-plan parser returned too much data.",
            undefined,
            error
          );
        }
        if (error.code === "invalid_response" || error.code === "empty_response") {
          throw new ApiRouteError(
            502,
            "ai_invalid_output",
            "Training-plan parser returned invalid output.",
            undefined,
            error
          );
        }
      }
      throw new ApiRouteError(
        502,
        "ai_provider_error",
        "Training-plan parsing failed. Try again.",
        undefined,
        error
      );
    }

    const validatedPayload = generatedPayloadSchema.safeParse(candidateJson);
    if (!validatedPayload.success) {
      throw new ApiRouteError(
        502,
        "ai_invalid_output",
        "Training-plan parser returned invalid output."
      );
    }

    const responsePayload = {
      ...normalizeGeneratedPayload(validatedPayload.data, today, categoryCatalog),
      correlationId,
    };
    return NextResponse.json(responsePayload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
