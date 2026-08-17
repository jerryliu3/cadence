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
const TRAINING_PLAN_KEYWORD_RE =
  /\b(run|running|5k|10k|marathon|half\s*marathon|training|workout|interval|tempo|long run|recovery run|strength|mobility|gym)\b/i;

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
    target_count: z.number().int().positive().nullable().optional(),
    milestone_names: z
      .array(z.string().trim().min(1).max(200))
      .max(MAX_MILESTONE_NAMES_PER_GOAL)
      .optional(),
    start_date: z.string().optional(),
    end_date: z.string().nullable().optional(),
    default_local_time: z.string().nullable().optional(),
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
            target_count: { type: "number" },
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

function extractTrainingSessionCycle(text: string): string[] {
  const normalized = text.toLowerCase();
  const sessionPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: "Easy run", pattern: /\beasy run\b|\beasy\b/ },
    { label: "Tempo run", pattern: /\btempo\b/ },
    { label: "Interval run", pattern: /\binterval\b|\bspeed\b/ },
    { label: "Long run", pattern: /\blong run\b/ },
    { label: "Recovery run", pattern: /\brecovery run\b/ },
    { label: "Steady run", pattern: /\bsteady\b/ },
    { label: "Hill run", pattern: /\bhill\b/ },
    { label: "Test run", pattern: /\btest run\b|\brace\b/ },
    { label: "Strength", pattern: /\bstrength\b/ },
    { label: "Mobility", pattern: /\bmobility\b/ },
  ];
  const labels = sessionPatterns
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ label }) => label);
  if (labels.length > 0) {
    return labels;
  }
  if (/\b(run|running)\b/.test(normalized)) {
    return ["Run session"];
  }
  return [];
}

function buildTrainingMilestoneNames(targetCount: number, text: string): string[] {
  const cycle = extractTrainingSessionCycle(text);
  if (cycle.length === 0) {
    return Array.from({ length: targetCount }, (_, index) => `Session ${index + 1}`);
  }
  if (cycle.length === 1) {
    return Array.from(
      { length: targetCount },
      (_, index) => `${cycle[0]} ${index + 1}`
    );
  }
  return Array.from({ length: targetCount }, (_, index) => {
    const week = Math.floor(index / cycle.length) + 1;
    const label = cycle[index % cycle.length] ?? "Session";
    return `Week ${week} ${label}`;
  });
}

function shouldCoerceToFixedMilestones({
  parserPrompt,
  title,
  description,
  targetCount,
  frequency,
  endDate,
}: {
  parserPrompt: string;
  title: string;
  description: string;
  targetCount: number | null;
  frequency: "recurring" | "fixed_milestones";
  endDate: string | null;
}) {
  if (
    frequency !== "recurring" ||
    !endDate ||
    typeof targetCount !== "number" ||
    targetCount <= 1
  ) {
    return false;
  }
  const text = `${parserPrompt}\n${title}\n${description}`;
  if (!TRAINING_PLAN_KEYWORD_RE.test(text)) {
    return false;
  }
  return /\bweek\b|\bweeks\b/i.test(text) || targetCount >= 6;
}

function normalizeGeneratedPayload(
  payload: GeneratedPayload,
  today: string,
  categoryCatalog: typeof DEFAULT_GOAL_CATEGORIES,
  parserPrompt: string
) {
  const warnings: string[] = [];
  const goals = payload.goals.map((goal, index) => {
    let frequency = goal.frequency_type ?? "recurring";
    let recurrence =
      frequency === "recurring"
        ? goal.recurrence_interval ?? "daily"
        : undefined;
    const providedMilestoneNames =
      Array.isArray(goal.milestone_names) &&
      goal.milestone_names.length > 0
        ? goal.milestone_names
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
        : undefined;
    const startDate = toIsoDate(goal.start_date) ?? today;
    const endDate = toIsoDate(goal.end_date ?? undefined) ?? null;
    const targetCount = goal.target_count ?? null;
    const shouldCoerce = shouldCoerceToFixedMilestones({
      parserPrompt,
      title: goal.title.trim(),
      description: goal.description?.trim() ?? "",
      targetCount,
      frequency,
      endDate,
    });
    if (shouldCoerce) {
      frequency = "fixed_milestones";
      recurrence = undefined;
    }
    const milestoneNames =
      frequency === "fixed_milestones"
        ? providedMilestoneNames && providedMilestoneNames.length > 0
          ? providedMilestoneNames
          : typeof targetCount === "number" && targetCount > 0
            ? buildTrainingMilestoneNames(
                targetCount,
                `${goal.title ?? ""}\n${goal.description ?? ""}\n${parserPrompt}`
              )
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

    const responsePayload = {
      ...normalizeGeneratedPayload(
        validatedPayload.data,
        today,
        categoryCatalog,
        parsedRequest.prompt
      ),
      correlationId,
    };

    return NextResponse.json(responsePayload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
