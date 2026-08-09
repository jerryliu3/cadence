import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { GeminiRequestError, generateGeminiJson } from "@/lib/ai/gemini";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  fetchGoalCategories,
  type GoalCategory,
  resolveCategoryKey,
} from "@/lib/goals/category";
import { validateGoalDefinition } from "@/lib/goals/definition-validation";
import {
  consumePlannerAiQuota,
  readBulkParserQuotaLimit,
} from "@/lib/planner/ai-quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_GOALS_PER_REQUEST = 50;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const PROVIDER_TIMEOUT_MS = 12_000;
const MAX_PROVIDER_ATTEMPTS = 2;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidIanaTimezone, "Provide a valid IANA timezone."),
});

function buildCategoryContext(categories: GoalCategory[]) {
  const keys = categories.map((category) => category.key);
  return {
    keys,
    keySet: new Set(keys),
  };
}

function createGeneratedGoalSchema(categoryKeys: Set<string>) {
  return z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    category_key: z
      .string()
      .trim()
      .refine((value) => categoryKeys.has(value), "category_key must be known")
      .optional(),
    frequency_type: z.enum(["recurring", "fixed_milestones"]).optional(),
    recurrence_interval: z.enum(["daily", "weekly", "monthly"]).optional(),
    target_count: z.number().int().positive().nullable().optional(),
    start_date: z.string().optional(),
    end_date: z.string().nullable().optional(),
    default_local_time: z.string().nullable().optional(),
  });
}

function createGeneratedPayloadSchema(categoryKeys: Set<string>) {
  return z.object({
    goals: z.array(createGeneratedGoalSchema(categoryKeys)).max(MAX_GOALS_PER_REQUEST),
  });
}

function createBulkGoalResponseSchema(categoryKeys: string[]) {
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
    '- "start_date" (YYYY-MM-DD)',
    '- "end_date" (YYYY-MM-DD or null)',
    '- "default_local_time" (HH:MM 24-hour local time string or null)',
    "",
    "Rules:",
    `- If start date is missing, use ${today}.`,
    '- If frequency is missing, default to "recurring".',
    '- If recurrence interval is missing for recurring, default to "daily".',
    '- For fixed goals, include a positive target_count when possible.',
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

function normalizeGeneratedPayload(
  payload: {
    goals: Array<{
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
    }>;
  },
  today: string,
  categories: GoalCategory[]
) {
  const warnings: string[] = [];
  const goals = payload.goals.map((goal, index) => {
    const frequency = goal.frequency_type ?? "recurring";
    const recurrence =
      frequency === "recurring"
        ? goal.recurrence_interval ?? "daily"
        : undefined;
    const startDate = toIsoDate(goal.start_date) ?? today;
    const endDate = toIsoDate(goal.end_date ?? undefined) ?? null;
    const normalized = {
      title: goal.title.trim(),
      description: goal.description?.trim() ?? "",
      category: goal.category?.trim() ?? "Personal",
      category_key: goal.category_key
        ? goal.category_key
        : resolveCategoryKey(goal.category?.trim() ?? "Personal", categories),
      frequency_type: frequency,
      recurrence_interval: recurrence,
      target_count: goal.target_count ?? null,
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
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return errorResponse(
      401,
      "authentication_required",
      "Sign in to generate goal drafts.",
      correlationId
    );
  }

  const categoryCatalog = await fetchGoalCategories(supabase);
  const categoryContext = buildCategoryContext(categoryCatalog);
  const generatedPayloadSchema = createGeneratedPayloadSchema(
    categoryContext.keySet
  );
  const bulkGoalResponseSchema = createBulkGoalResponseSchema(
    categoryContext.keys
  );

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(
      413,
      "request_too_large",
      "The natural-language request is too large.",
      correlationId
    );
  }

  const rawBody = await request.text();
  const inputBytes = Buffer.byteLength(rawBody, "utf8");
  if (inputBytes > MAX_REQUEST_BYTES) {
    return errorResponse(
      413,
      "request_too_large",
      "The natural-language request is too large.",
      correlationId
    );
  }

  let requestBody: unknown;
  try {
    requestBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
      correlationId
    );
  }

  const parsedRequest = requestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return errorResponse(
      400,
      "validation_failed",
      "Provide a non-empty prompt and valid IANA timezone.",
      correlationId
    );
  }

  let quotaLimit: number;
  try {
    quotaLimit = readBulkParserQuotaLimit();
  } catch {
    return errorResponse(
      503,
      "capability_configuration_invalid",
      "Goal draft generation is temporarily unavailable.",
      correlationId
    );
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse(
      503,
      "ai_unavailable",
      "Goal draft generation is temporarily unavailable.",
      correlationId
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return errorResponse(
      503,
      "admin_configuration_invalid",
      "Goal draft generation is temporarily unavailable.",
      correlationId
    );
  }

  const today = getDateInTimezone(new Date(), parsedRequest.data.timezone);
  const estimatedInputTokens = Math.max(
    1,
    Math.ceil(parsedRequest.data.prompt.length / 4)
  );

  let quota;
  try {
    quota = await consumePlannerAiQuota({
      admin,
      ownerId: user.id,
      feature: "bulk_parser",
      limit: quotaLimit,
      estimatedInputTokens,
    });
  } catch {
    return errorResponse(
      503,
      "quota_check_failed",
      "Goal draft generation is temporarily unavailable.",
      correlationId
    );
  }

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

  let candidateJson: unknown;
  try {
    const result = await generateGeminiJson({
      apiKey,
      prompt: buildPrompt(parsedRequest.data.prompt, today, categoryContext.keys),
      responseSchema: bulkGoalResponseSchema as unknown as Record<string, unknown>,
      maxResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
      totalTimeoutMs: PROVIDER_TIMEOUT_MS,
      maxAttempts: MAX_PROVIDER_ATTEMPTS,
      signal: request.signal,
    });
    candidateJson = result.candidateJson;
  } catch (error) {
    if (error instanceof GeminiRequestError) {
      if (error.code === "timeout") {
        return errorResponse(
          504,
          "ai_timeout",
          "Goal draft generation timed out. Try again.",
          correlationId
        );
      }
      if (error.code === "response_too_large") {
        return errorResponse(
          502,
          "ai_response_too_large",
          "Goal draft generation returned too much data.",
          correlationId
        );
      }
      if (error.code === "invalid_response" || error.code === "empty_response") {
        return errorResponse(
          502,
          "ai_invalid_output",
          "Generated goal drafts could not be validated.",
          correlationId
        );
      }
    }
    return errorResponse(
      502,
      "ai_provider_error",
      "Goal draft generation failed. Try again.",
      correlationId
    );
  }

  const validatedPayload = generatedPayloadSchema.safeParse(candidateJson);
  if (!validatedPayload.success) {
    return errorResponse(
      502,
      "ai_invalid_output",
      "Generated goal drafts could not be validated.",
      correlationId
    );
  }

  const responsePayload = {
    ...normalizeGeneratedPayload(validatedPayload.data, today, categoryCatalog),
    correlationId,
  };

  return NextResponse.json(
    responsePayload,
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
