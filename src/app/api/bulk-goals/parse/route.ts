import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const MAX_GOALS_PER_REQUEST = 50;
const defaultGeminiModel = "gemini-3.5-flash";

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
});

const generatedGoalSchema = z.object({
  title: z.string().trim().min(1).max(200),
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

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString().slice(0, 10);
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

function buildPrompt(userPrompt: string): string {
  const today = new Date().toISOString().slice(0, 10);

  return [
    "Convert the following user text into goal drafts.",
    "Return only JSON with no markdown fences and no extra prose.",
    'The JSON shape must be: {"goals":[{...}]}',
    "Each goal object can include these keys:",
    '- "title" (required string)',
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

function normalizeGeneratedPayload(payload: z.infer<typeof generatedPayloadSchema>) {
  return {
    goals: payload.goals.map((goal) => {
      const frequency = goal.frequency_type ?? "recurring";
      const recurrence = frequency === "recurring" ? goal.recurrence_interval ?? "daily" : undefined;
      const startDate = toIsoDate(goal.start_date) ?? new Date().toISOString().slice(0, 10);
      const endDate = toIsoDate(goal.end_date ?? undefined) ?? null;

      return {
        title: goal.title.trim(),
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

export async function POST(request: Request) {
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsedRequest = requestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "Provide a non-empty natural language prompt." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing GEMINI_API_KEY in the server environment. Add it to .env.local and restart the dev server.",
      },
      { status: 500 }
    );
  }

  const configuredModel = process.env.GEMINI_MODEL?.trim() || defaultGeminiModel;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${configuredModel}:generateContent`;

  const geminiResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: buildPrompt(parsedRequest.data.prompt) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
    cache: "no-store",
  });

  if (!geminiResponse.ok) {
    const errorBody = await geminiResponse.text();
    return NextResponse.json(
      {
        error: `Gemini request failed with status ${geminiResponse.status}.`,
        details: errorBody.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const geminiJson = (await geminiResponse.json()) as unknown;
  const candidateText = extractFirstTextCandidate(geminiJson);
  if (!candidateText) {
    return NextResponse.json(
      { error: "Gemini returned an empty response. Try a more specific prompt." },
      { status: 502 }
    );
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = parseJsonText(candidateText);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gemini output could not be parsed as JSON.",
        details: error instanceof Error ? error.message : "Unknown JSON parsing error.",
      },
      { status: 502 }
    );
  }

  const validatedPayload = generatedPayloadSchema.safeParse(parsedPayload);
  if (!validatedPayload.success) {
    return NextResponse.json(
      {
        error: "Gemini output did not match the expected goal format.",
        details: validatedPayload.error.issues.map((issue) => issue.message).join(" "),
      },
      { status: 502 }
    );
  }

  return NextResponse.json(normalizeGeneratedPayload(validatedPayload.data));
}
