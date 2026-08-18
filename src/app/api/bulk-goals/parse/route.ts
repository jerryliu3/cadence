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
import {
  MAX_GOAL_TARGET_COUNT,
  validateGoalDefinition,
} from "@/lib/goals/definition-validation";
import {
  consumePlannerAiQuota,
  readBulkParserQuotaLimit,
} from "@/lib/planner/ai-quota";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_GOALS_PER_REQUEST = 50;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const PROVIDER_TIMEOUT_MS = 12_000;
const MAX_PROVIDER_ATTEMPTS = 2;
const BULK_PARSER_RATE_LIMIT_PER_MINUTE = 20;
const MAX_MILESTONE_NAMES_PER_GOAL = 366;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const INVALID_ARGUMENT_PROVIDER_RE = /\(400\)|INVALID_ARGUMENT/i;
const MILESTONE_GENERIC_NAME_RE = /^(milestone|session|step)\s*\d+$/i;
const MILESTONE_WEEK_SUMMARY_RE =
  /^week\s*\d+\s*[:\-]\s*\d+\s*(runs?|sessions?|workouts?)$/i;

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidIanaTimezone, "Provide a valid IANA timezone."),
});

type GeneratedGoal = {
  title: string;
  description?: string;
  category?: string;
  category_key?: string;
  frequency_type?: "recurring" | "fixed_milestones";
  recurrence_interval?: "daily" | "weekly" | "monthly";
  target_count?: number | null;
  milestone_names?: string[];
  start_date?: string;
  end_date?: string | null;
  default_local_time?: string | null;
};

type GeneratedPayload = {
  goals: GeneratedGoal[];
};

function buildGeneratedPayloadSchema(categoryKeySet: Set<string>) {
  const generatedGoalSchema = z
    .object({
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
      milestone_names: z
        .array(z.string().trim().min(1).max(200))
        .max(MAX_MILESTONE_NAMES_PER_GOAL)
        .optional(),
      start_date: z.string().optional(),
      end_date: z.string().nullable().optional(),
      default_local_time: z.string().nullable().optional(),
    })
    .superRefine((goal, context) => {
      if (
        goal.frequency_type === "fixed_milestones" &&
        typeof goal.target_count === "number" &&
        goal.target_count > MAX_MILESTONE_NAMES_PER_GOAL
      ) {
        context.addIssue({
          code: "custom",
          path: ["target_count"],
          message: `target_count must be <= ${MAX_MILESTONE_NAMES_PER_GOAL} for fixed milestones`,
        });
      }
    });
  return z.object({
    goals: z.array(generatedGoalSchema).max(MAX_GOALS_PER_REQUEST),
  });
}

function buildBulkGoalResponseSchema(categoryKeys: string[]) {
  return {
    type: "object",
    properties: {
      goals: {
        type: "array",
        maxItems: MAX_GOALS_PER_REQUEST,
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
            milestone_names: {
              type: "array",
              maxItems: MAX_MILESTONE_NAMES_PER_GOAL,
              items: { type: "string" },
            },
            start_date: { type: "string" },
            end_date: { type: "string" },
            default_local_time: { type: "string" },
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

function buildPrompt(userPrompt: string, today: string, categoryKeys: string[]): string {
  return [
    "Convert the following user text into goal drafts.",
    "Return only JSON with no markdown fences and no extra prose.",
    'The JSON shape must be: {"goals":[{...}]}',
    "Each goal object can include these keys:",
    '- "title" (required string)',
    '- "description" (optional string)',
    '- "category" (string, prefer Personal/Relationships/Health; otherwise custom)',
    `- "category_key" (${categoryKeys.join(" | ")})`,
    '- "frequency_type" ("recurring" | "fixed_milestones")',
    '- "recurrence_interval" ("daily" | "weekly" | "monthly", only for recurring)',
    '- "target_count" (positive integer or null)',
    '- "milestone_names" (array of short session names, only for fixed_milestones)',
    '- "start_date" (YYYY-MM-DD)',
    '- "end_date" (YYYY-MM-DD or null)',
    '- "default_local_time" (HH:MM 24-hour local time string or null)',
    "",
    "Rules:",
    `- If start date is missing, use ${today}.`,
    "- Think briefly about plan structure before responding: choose the smallest goal set that still captures distinct sessions.",
    '- Choose "fixed_milestones" for ordered programs where sessions differ over time (for example easy run -> tempo -> long run progression).',
    '- Choose "recurring" only when sessions are genuinely repetitive and interchangeable.',
    "- Never create one goal per workout, session, or date. Consolidate into 1-5 goals.",
    '- If frequency is missing, default to "recurring".',
    '- If recurrence interval is missing for recurring, default to "daily".',
    '- For fixed goals, include a positive target_count when possible.',
    '- For fixed goals, include milestone_names in order when session names are inferable.',
    '- For fixed goals with milestone_names, keep the list length aligned with target_count.',
    "- For recurring goals, only set target_count when the user asks for a total count by a deadline.",
    "- Fixed milestones always require an end_date.",
    "- Recurring goals with a positive target_count always require an end_date.",
    "- Open-ended goals are only valid for recurring cadence goals (target_count null).",
    "- If end_date is present, keep the start_date..end_date window at 24 calendar months or less.",
    `- Return at most ${MAX_GOALS_PER_REQUEST} goals.`,
    "",
    "Few-shot example for progression plans:",
    'Input: "Create a 4-week 5k plan with 3 runs per week: easy, tempo, long."',
    'Output: {"goals":[{"title":"4-week 5k progression","frequency_type":"fixed_milestones","target_count":12,"milestone_names":["Week 1 - Easy run (conversational pace)","Week 1 - Tempo run (comfortably hard effort)","Week 1 - Long run (steady endurance)","Week 2 - Easy run (conversational pace)","Week 2 - Tempo run (comfortably hard effort)","Week 2 - Long run (steady endurance)","Week 3 - Easy run (conversational pace)","Week 3 - Tempo run (comfortably hard effort)","Week 3 - Long run (steady endurance)","Week 4 - Easy run (conversational pace)","Week 4 - Tempo run (comfortably hard effort)","Week 4 - Long run (steady endurance)"],"start_date":"2026-08-17","end_date":"2026-09-13"}]}',
    "",
    "User input:",
    userPrompt,
  ].join("\n");
}

function normalizeLocalTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (localTimePattern.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const candidate = `${match[1].padStart(2, "0")}:${match[2]}`;
    if (localTimePattern.test(candidate)) return candidate;
  }
  return null;
}

function normalizeMilestoneNameList(names: string[] | undefined) {
  return (names ?? []).map((name) => name.trim()).filter((name) => name.length > 0);
}

function deriveFixedMilestoneTargetCount(goal: Pick<GeneratedGoal, "target_count" | "milestone_names">) {
  if (typeof goal.target_count === "number" && goal.target_count > 0) {
    return goal.target_count;
  }
  const inferredCount = normalizeMilestoneNameList(goal.milestone_names).length;
  return inferredCount > 0 ? inferredCount : null;
}

function normalizeMilestoneNamesToTargetCount(
  targetCount: number,
  names: string[] | undefined
) {
  const normalizedNames = normalizeMilestoneNameList(names);
  return Array.from({ length: targetCount }, (_, index) => {
    return normalizedNames[index] ?? `Session ${index + 1}`;
  });
}

function isGenericMilestoneName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return true;
  }
  return (
    MILESTONE_GENERIC_NAME_RE.test(trimmed) ||
    MILESTONE_WEEK_SUMMARY_RE.test(trimmed)
  );
}

function needsMilestoneNameRetry(goal: GeneratedGoal) {
  if (goal.frequency_type !== "fixed_milestones") {
    return false;
  }
  const targetCount = deriveFixedMilestoneTargetCount(goal);
  if (!targetCount) {
    return false;
  }
  const names = normalizeMilestoneNameList(goal.milestone_names);
  if (names.length < targetCount) {
    return true;
  }
  const normalizedNames = names.slice(0, targetCount);
  const uniqueNames = new Set(
    normalizedNames.map((name) => name.toLowerCase().replace(/\s+/g, " ").trim())
  );
  if (uniqueNames.size <= 1) {
    return true;
  }
  if (normalizedNames.some((name) => isGenericMilestoneName(name))) {
    return true;
  }
  return false;
}

function buildMilestoneNameRetryPrompt({
  parserPrompt,
  goal,
  targetCount,
}: {
  parserPrompt: string;
  goal: GeneratedGoal;
  targetCount: number;
}) {
  return [
    "Refine milestone names for a single fixed_milestones goal.",
    "Return only JSON with no markdown fences and no extra prose.",
    'JSON shape: {"milestone_names":["..."]}',
    `Provide exactly ${targetCount} milestone_names in chronological order.`,
    "Each milestone name must describe the specific activity/instruction for that session.",
    'Do not use generic summaries such as "Week 1: 3 runs" or placeholders such as "Milestone 1".',
    "Preserve the user's language and domain context.",
    "",
    "Original user request:",
    parserPrompt,
    "",
    "Goal draft context:",
    JSON.stringify(
      {
        title: goal.title,
        description: goal.description ?? "",
        target_count: targetCount,
        start_date: goal.start_date ?? null,
        end_date: goal.end_date ?? null,
        existing_milestone_names: goal.milestone_names ?? [],
      },
      null,
      2
    ),
  ].join("\n");
}

function buildMilestoneNameRetryResponseSchema(targetCount: number) {
  return {
    type: "object",
    properties: {
      milestone_names: {
        type: "array",
        minItems: targetCount,
        maxItems: targetCount,
        items: { type: "string" },
      },
    },
    required: ["milestone_names"],
  } as const;
}

function buildMilestoneNameRetryZodSchema(targetCount: number) {
  return z.object({
    milestone_names: z
      .array(z.string().trim().min(1).max(200))
      .length(targetCount),
  });
}

async function regenerateMilestoneNames({
  apiKey,
  retryPrompt,
  targetCount,
  signal,
}: {
  apiKey: string;
  retryPrompt: string;
  targetCount: number;
  signal: AbortSignal;
}) {
  let result: Awaited<ReturnType<typeof generateGeminiJson>>;
  try {
    result = await generateGeminiJson({
      apiKey,
      prompt: retryPrompt,
      responseSchema: buildMilestoneNameRetryResponseSchema(
        targetCount
      ) as unknown as Record<string, unknown>,
      maxResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
      totalTimeoutMs: PROVIDER_TIMEOUT_MS,
      maxAttempts: MAX_PROVIDER_ATTEMPTS,
      signal,
    });
  } catch (error) {
    if (error instanceof GeminiRequestError && shouldRetryWithoutResponseSchema(error)) {
      result = await generateGeminiJson({
        apiKey,
        prompt: retryPrompt,
        maxResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
        totalTimeoutMs: PROVIDER_TIMEOUT_MS,
        maxAttempts: MAX_PROVIDER_ATTEMPTS,
        signal,
      });
    } else {
      throw error;
    }
  }
  const parsed = buildMilestoneNameRetryZodSchema(targetCount).safeParse(
    result.candidateJson
  );
  return parsed.success ? parsed.data.milestone_names : null;
}

async function refineMilestoneNamesForGoals({
  goals,
  parserPrompt,
  apiKey,
  signal,
  quotaContext,
}: {
  goals: GeneratedGoal[];
  parserPrompt: string;
  apiKey: string;
  signal: AbortSignal;
  quotaContext: {
    admin: ReturnType<typeof createAdminClient>;
    ownerId: string;
    limit: number;
  };
}) {
  const refinements = await Promise.all(
    goals.map(async (goal, index) => {
      const targetCount = deriveFixedMilestoneTargetCount(goal);
      if (!targetCount || !needsMilestoneNameRetry(goal)) {
        return { goal, warning: null as string | null };
      }

      const retryPrompt = buildMilestoneNameRetryPrompt({
        parserPrompt,
        goal,
        targetCount,
      });
      let retryBlockedByQuota = false;
      const retryInputTokens = Math.max(1, Math.ceil(retryPrompt.length / 4));
      try {
        const retryQuota = await consumePlannerAiQuota({
          admin: quotaContext.admin,
          ownerId: quotaContext.ownerId,
          feature: "bulk_parser",
          limit: quotaContext.limit,
          estimatedInputTokens: retryInputTokens,
        });
        retryBlockedByQuota = !retryQuota.allowed;
      } catch {
        retryBlockedByQuota = true;
      }

      let regenerated: string[] | null = null;
      if (!retryBlockedByQuota) {
        try {
          regenerated = await regenerateMilestoneNames({
            apiKey,
            retryPrompt,
            targetCount,
            signal,
          });
        } catch {
          regenerated = null;
        }
      }

      if (regenerated) {
        const regeneratedGoal = { ...goal, milestone_names: regenerated };
        if (!needsMilestoneNameRetry(regeneratedGoal)) {
          return { goal: regeneratedGoal, warning: null as string | null };
        }
      }

      const bestAvailableNames = normalizeMilestoneNameList(
        regenerated ?? goal.milestone_names
      );
      const hasBestAvailableNames = bestAvailableNames.length > 0;
      const fallbackMilestoneNames = hasBestAvailableNames
        ? normalizeMilestoneNamesToTargetCount(targetCount, bestAvailableNames)
        : normalizeMilestoneNamesToTargetCount(targetCount, undefined);

      const warning = retryBlockedByQuota
        ? hasBestAvailableNames
          ? `Draft ${index + 1} (${goal.title.trim()}): milestone-name refinement was skipped because quota is exhausted; kept best available labels for review.`
          : `Draft ${index + 1} (${goal.title.trim()}): milestone-name refinement was skipped because quota is exhausted; using neutral session labels for review.`
        : hasBestAvailableNames
          ? `Draft ${index + 1} (${goal.title.trim()}): milestone names remained incomplete or generic after refinement; kept best available labels for review.`
          : `Draft ${index + 1} (${goal.title.trim()}): milestone names remained incomplete or generic; using neutral session labels for review.`;

      return {
        goal: {
          ...goal,
          milestone_names: fallbackMilestoneNames,
        },
        warning,
      };
    })
  );

  return {
    goals: refinements.map((entry) => entry.goal),
    warnings: refinements
      .map((entry) => entry.warning)
      .filter((warning): warning is string => Boolean(warning)),
  };
}

function normalizeGeneratedPayload(
  payload: GeneratedPayload,
  today: string,
  categoryCatalog: typeof DEFAULT_GOAL_CATEGORIES
) {
  const warnings: string[] = [];
  const goals = payload.goals.map((goal, index) => {
    const frequency = goal.frequency_type ?? "recurring";
    const normalizedMilestoneNames = normalizeMilestoneNameList(goal.milestone_names);
    const targetCount =
      frequency === "fixed_milestones"
        ? deriveFixedMilestoneTargetCount(goal)
        : goal.target_count ?? null;
    const recurrence =
      frequency === "recurring"
        ? goal.recurrence_interval ?? "daily"
        : undefined;
    const startDate = toIsoDate(goal.start_date) ?? today;
    const endDate = toIsoDate(goal.end_date ?? undefined) ?? null;
    const milestoneNames =
      frequency === "fixed_milestones"
        ? typeof targetCount === "number" && targetCount > 0
          ? normalizeMilestoneNamesToTargetCount(targetCount, normalizedMilestoneNames)
          : normalizedMilestoneNames.length > 0
            ? normalizedMilestoneNames
            : undefined
        : undefined;
    const normalized = {
      title: goal.title.trim(),
      description: goal.description?.trim() ?? "",
      category: goal.category?.trim() ?? "Personal",
      category_key: goal.category_key
        ? goal.category_key
        : resolveCategoryKey(goal.category?.trim() ?? "Personal", categoryCatalog),
      frequency_type: frequency,
      recurrence_interval: recurrence,
      target_count: targetCount,
      milestone_names:
        milestoneNames && milestoneNames.length > 0 ? milestoneNames : undefined,
      start_date: startDate,
      end_date: endDate,
      default_local_time: normalizeLocalTime(goal.default_local_time),
    };
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

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { supabase, userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to generate goal drafts.",
    });

    const rate = checkRateLimit({
      key: `bulk-goals-parse:${userId}`,
      limit: BULK_PARSER_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        {
          code: "rate_limited",
          message: "Too many draft generation requests. Try again shortly.",
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
          "Provide a non-empty prompt and valid IANA timezone.",
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
        "Goal draft generation is temporarily unavailable."
      );
    }

    const apiKey = getServerEnv().GEMINI_API_KEY;
    if (!apiKey) {
      throw new ApiRouteError(
        503,
        "ai_unavailable",
        "Goal draft generation is temporarily unavailable."
      );
    }

    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch {
      throw new ApiRouteError(
        503,
        "admin_configuration_invalid",
        "Goal draft generation is temporarily unavailable."
      );
    }

    const categoryCatalog = await readCategoryCatalog(supabase);
    const categoryKeys = categoryCatalog.map((category) => category.key);
    const categoryKeySet = new Set(categoryKeys);
    const generatedPayloadSchema = buildGeneratedPayloadSchema(categoryKeySet);
    const responseSchema = buildBulkGoalResponseSchema(categoryKeys);

    const today = getDateInTimezone(new Date(), parsedRequest.timezone);
    const estimatedInputTokens = Math.max(
      1,
      Math.ceil(parsedRequest.prompt.length / 4)
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
        "Goal draft generation is temporarily unavailable."
      );
    });

    if (!quota.allowed) {
      return NextResponse.json(
        {
          code: "quota_exceeded",
          message: "Daily goal draft generation limit reached.",
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

    const prompt = buildPrompt(parsedRequest.prompt, today, categoryKeys);
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
            "Goal draft generation timed out. Try again.",
            undefined,
            error
          );
        }
        if (error.code === "response_too_large") {
          throw new ApiRouteError(
            502,
            "ai_response_too_large",
            "Goal draft generation returned too much data.",
            undefined,
            error
          );
        }
        if (error.code === "invalid_response" || error.code === "empty_response") {
          throw new ApiRouteError(
            502,
            "ai_invalid_output",
            "Generated goal drafts could not be validated.",
            undefined,
            error
          );
        }
      }
      throw new ApiRouteError(
        502,
        "ai_provider_error",
        "Goal draft generation failed. Try again.",
        undefined,
        error
      );
    }

    const validatedPayload = generatedPayloadSchema.safeParse(candidateJson);
    if (!validatedPayload.success) {
      throw new ApiRouteError(
        502,
        "ai_invalid_output",
        "Generated goal drafts could not be validated."
      );
    }

    const milestoneRefinements = await refineMilestoneNamesForGoals({
      goals: validatedPayload.data.goals,
      parserPrompt: parsedRequest.prompt,
      apiKey,
      signal: request.signal,
      quotaContext: {
        admin,
        ownerId: userId,
        limit: quotaLimit,
      },
    });
    const normalizedPayload = normalizeGeneratedPayload(
      { goals: milestoneRefinements.goals },
      today,
      categoryCatalog
    );
    const responsePayload = {
      ...normalizedPayload,
      warnings: [...normalizedPayload.warnings, ...milestoneRefinements.warnings],
      correlationId,
    };

    return NextResponse.json(responsePayload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
