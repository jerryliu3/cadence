import { NextResponse } from "next/server";
import { z } from "zod";
import { GeminiRequestError, generateGeminiJson } from "@/lib/ai/gemini";
import { checkRateLimit } from "@/lib/api/rate-limit";
import {
  ApiRouteError,
  parseJsonBody,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import { getServerEnv } from "@/lib/env";
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
const BULK_PARSER_RATE_LIMIT_PER_MINUTE = 20;
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

const generatedGoalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  frequency_type: z.enum(["recurring", "fixed_milestones"]).optional(),
  recurrence_interval: z.enum(["daily", "weekly", "monthly"]).optional(),
  target_count: z.number().int().positive().nullable().optional(),
  start_date: z.string().optional(),
  end_date: z.string().nullable().optional(),
  default_local_time: z.string().nullable().optional(),
});

const generatedPayloadSchema = z.object({
  goals: z.array(generatedGoalSchema).max(MAX_GOALS_PER_REQUEST),
});

const bulkGoalResponseSchema = {
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

function buildPrompt(userPrompt: string, today: string): string {
  return [
    "Convert the following user text into goal drafts.",
    "Return only JSON with no markdown fences and no extra prose.",
    'The JSON shape must be: {"goals":[{...}]}',
    "Each goal object can include these keys:",
    '- "title" (required string)',
    '- "description" (optional string)',
    '- "category" (string, prefer Personal/Relationships/Health; otherwise custom)',
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
  payload: z.infer<typeof generatedPayloadSchema>,
  today: string
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

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
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

    let candidateJson: unknown;
    try {
      const result = await generateGeminiJson({
        apiKey,
        prompt: buildPrompt(parsedRequest.prompt, today),
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
          throw new ApiRouteError(
            504,
            "ai_timeout",
            "Goal draft generation timed out. Try again."
          );
        }
        if (error.code === "response_too_large") {
          throw new ApiRouteError(
            502,
            "ai_response_too_large",
            "Goal draft generation returned too much data."
          );
        }
        if (error.code === "invalid_response" || error.code === "empty_response") {
          throw new ApiRouteError(
            502,
            "ai_invalid_output",
            "Generated goal drafts could not be validated."
          );
        }
      }
      throw new ApiRouteError(
        502,
        "ai_provider_error",
        "Goal draft generation failed. Try again."
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
      ...normalizeGeneratedPayload(validatedPayload.data, today),
      correlationId,
    };

    return NextResponse.json(responsePayload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
