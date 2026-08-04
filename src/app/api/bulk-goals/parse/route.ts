import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_GOALS_PER_REQUEST = 50;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const PROVIDER_TIMEOUT_MS = 12_000;
const defaultGeminiModel = "gemini-3.5-flash";

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
});

const generatedPayloadSchema = z.object({
  goals: z.array(generatedGoalSchema).max(MAX_GOALS_PER_REQUEST),
});

const geminiResponseSchema = z.object({
  candidates: z.array(
    z.object({
      content: z
        .object({
          parts: z.array(
            z.object({
              text: z.string().optional(),
            })
          ),
        })
        .optional(),
    })
  ),
});

function toIsoDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (z.iso.date().safeParse(trimmed).success) {
    return trimmed;
  }
  return undefined;
}

function extractFirstTextCandidate(responseJson: unknown): string {
  const parsed = geminiResponseSchema.safeParse(responseJson);
  if (!parsed.success) {
    return "";
  }

  for (const candidate of parsed.data.candidates) {
    const text = candidate.content?.parts
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function parseJsonText(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Empty model response.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1]?.trim() ?? "" : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
  }

  throw new Error("Model response was not valid JSON.");
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
    "",
    "Rules:",
    `- If start date is missing, use ${today}.`,
    '- If frequency is missing, default to "recurring".',
    '- If recurrence interval is missing for recurring, default to "daily".',
    '- For fixed goals, include a positive target_count when possible.',
    "- For recurring goals, only set target_count when the user asks for a total count by a deadline.",
    `- Return at most ${MAX_GOALS_PER_REQUEST} goals.`,
    "",
    "User input:",
    userPrompt,
  ].join("\n");
}

function normalizeGeneratedPayload(
  payload: z.infer<typeof generatedPayloadSchema>,
  today: string
) {
  return {
    goals: payload.goals.map((goal) => {
      const frequency = goal.frequency_type ?? "recurring";
      const recurrence = frequency === "recurring" ? goal.recurrence_interval ?? "daily" : undefined;
      const startDate = toIsoDate(goal.start_date) ?? today;
      const endDate = toIsoDate(goal.end_date ?? undefined) ?? null;

      return {
        title: goal.title.trim(),
        description: goal.description?.trim() ?? "",
        category: goal.category?.trim() ?? "Personal",
        frequency_type: frequency,
        recurrence_interval: recurrence,
        target_count: goal.target_count ?? null,
        start_date: startDate,
        end_date: endDate,
      };
    }),
  };
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
  if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
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

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse(
      503,
      "ai_unavailable",
      "Goal draft generation is temporarily unavailable.",
      correlationId
    );
  }

  const configuredModel =
    process.env.GEMINI_MODEL?.trim() || defaultGeminiModel;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${configuredModel}:generateContent`;
  const today = getDateInTimezone(
    new Date(),
    parsedRequest.data.timezone
  );

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(parsedRequest.data.prompt, today) },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          maxOutputTokens: 8_192,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      ]),
    });
  } catch (error) {
    const aborted =
      request.signal.aborted ||
      (error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError"));
    return errorResponse(
      aborted ? 504 : 502,
      aborted ? "ai_timeout" : "ai_provider_error",
      aborted
        ? "Goal draft generation timed out. Try again."
        : "Goal draft generation failed. Try again.",
      correlationId
    );
  }

  if (!geminiResponse.ok) {
    return errorResponse(
      502,
      "ai_provider_error",
      "Goal draft generation failed. Try again.",
      correlationId
    );
  }

  const providerContentLength = Number(
    geminiResponse.headers.get("content-length") ?? "0"
  );
  if (
    Number.isFinite(providerContentLength) &&
    providerContentLength > MAX_PROVIDER_RESPONSE_BYTES
  ) {
    return errorResponse(
      502,
      "ai_response_too_large",
      "Goal draft generation returned too much data.",
      correlationId
    );
  }

  let geminiJson: unknown;
  try {
    const responseText = await geminiResponse.text();
    if (
      Buffer.byteLength(responseText, "utf8") > MAX_PROVIDER_RESPONSE_BYTES
    ) {
      return errorResponse(
        502,
        "ai_response_too_large",
        "Goal draft generation returned too much data.",
        correlationId
      );
    }
    geminiJson = JSON.parse(responseText) as unknown;
  } catch {
    return errorResponse(
      502,
      "ai_invalid_response",
      "Goal draft generation returned an invalid response.",
      correlationId
    );
  }

  const candidateText = extractFirstTextCandidate(geminiJson);
  if (!candidateText) {
    return errorResponse(
      502,
      "ai_empty_response",
      "No goal drafts were generated. Try a more specific prompt.",
      correlationId
    );
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = parseJsonText(candidateText);
  } catch {
    return errorResponse(
      502,
      "ai_invalid_output",
      "Generated goal drafts could not be validated.",
      correlationId
    );
  }

  const validatedPayload = generatedPayloadSchema.safeParse(parsedPayload);
  if (!validatedPayload.success) {
    return errorResponse(
      502,
      "ai_invalid_output",
      "Generated goal drafts could not be validated.",
      correlationId
    );
  }

  return NextResponse.json(
    {
      ...normalizeGeneratedPayload(validatedPayload.data, today),
      correlationId,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
