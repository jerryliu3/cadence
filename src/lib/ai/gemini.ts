import { z } from "zod";

const defaultModel = "gemini-3.5-flash";

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
  usageMetadata: z
    .object({
      promptTokenCount: z.number().int().nonnegative().optional(),
      candidatesTokenCount: z.number().int().nonnegative().optional(),
      totalTokenCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type GeminiFailureCode =
  | "timeout"
  | "provider_error"
  | "invalid_response"
  | "response_too_large"
  | "empty_response";

export class GeminiRequestError extends Error {
  constructor(
    readonly code: GeminiFailureCode,
    readonly retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

export interface GeminiRequestOptions {
  prompt: string;
  responseSchema?: Record<string, unknown>;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  maxResponseBytes?: number;
  totalTimeoutMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

export interface GeminiRequestResult {
  candidateText: string;
  candidateJson: unknown;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  attempts: number;
}

function strictParseCandidateJson(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new GeminiRequestError(
      "empty_response",
      false,
      "Gemini returned an empty candidate."
    );
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new GeminiRequestError(
      "invalid_response",
      false,
      "Gemini candidate text was not valid JSON."
    );
  }
}

function extractFirstTextCandidate(responseJson: unknown): {
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const parsed = geminiResponseSchema.safeParse(responseJson);
  if (!parsed.success) {
    throw new GeminiRequestError(
      "invalid_response",
      false,
      "Gemini response payload shape was invalid."
    );
  }

  for (const candidate of parsed.data.candidates) {
    const text = (
      candidate.content?.parts.map((part) => part.text ?? "").join("") ?? ""
    ).trim();
    if (text.length > 0) {
      return {
        text,
        inputTokens: parsed.data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens:
          parsed.data.usageMetadata?.candidatesTokenCount ??
          parsed.data.usageMetadata?.totalTokenCount ??
          0,
        totalTokens: parsed.data.usageMetadata?.totalTokenCount ?? 0,
      };
    }
  }

  throw new GeminiRequestError(
    "empty_response",
    false,
    "Gemini response contained no text candidates."
  );
}

function isRetryableHttpStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function executeGeminiAttempt({
  prompt,
  responseSchema,
  apiKey,
  model,
  temperature,
  maxOutputTokens,
  maxResponseBytes,
  timeoutMs,
  signal,
}: {
  prompt: string;
  responseSchema?: Record<string, unknown>;
  apiKey: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  maxResponseBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
          responseSchema,
          maxOutputTokens,
        },
      }),
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    throw new GeminiRequestError(
      aborted ? "timeout" : "provider_error",
      !aborted,
      aborted ? "Gemini request timed out." : "Gemini request failed."
    );
  }

  if (!response.ok) {
    throw new GeminiRequestError(
      "provider_error",
      isRetryableHttpStatus(response.status),
      "Gemini request failed."
    );
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw new GeminiRequestError(
      "response_too_large",
      false,
      "Gemini response exceeded maximum size."
    );
  }

  const responseText = await response.text();
  if (Buffer.byteLength(responseText, "utf8") > maxResponseBytes) {
    throw new GeminiRequestError(
      "response_too_large",
      false,
      "Gemini response exceeded maximum size."
    );
  }

  let responseJson: unknown;
  try {
    responseJson = JSON.parse(responseText) as unknown;
  } catch {
    throw new GeminiRequestError(
      "invalid_response",
      false,
      "Gemini response body was not valid JSON."
    );
  }

  const candidate = extractFirstTextCandidate(responseJson);
  const candidateJson = strictParseCandidateJson(candidate.text);
  return {
    candidateText: candidate.text,
    candidateJson,
    inputTokens: candidate.inputTokens,
    outputTokens: candidate.outputTokens,
    totalTokens: candidate.totalTokens,
  };
}

export async function generateGeminiJson(
  options: GeminiRequestOptions
): Promise<GeminiRequestResult> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiRequestError(
      "provider_error",
      false,
      "Gemini API key is missing."
    );
  }

  const totalTimeoutMs = options.totalTimeoutMs ?? 12_000;
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 2, 2));
  const model = options.model?.trim() || process.env.GEMINI_MODEL?.trim() || defaultModel;
  const temperature = options.temperature ?? 0.2;
  const maxOutputTokens = options.maxOutputTokens ?? 8_192;
  const maxResponseBytes = options.maxResponseBytes ?? 256 * 1024;
  const startedAt = Date.now();

  let attempts = 0;
  let lastError: GeminiRequestError | null = null;
  while (attempts < maxAttempts) {
    attempts += 1;
    const elapsed = Date.now() - startedAt;
    const remaining = totalTimeoutMs - elapsed;
    if (remaining <= 0) {
      throw new GeminiRequestError(
        "timeout",
        false,
        "Gemini request timed out."
      );
    }

    try {
      const result = await executeGeminiAttempt({
        prompt: options.prompt,
        responseSchema: options.responseSchema,
        apiKey,
        model,
        temperature,
        maxOutputTokens,
        maxResponseBytes,
        timeoutMs: remaining,
        signal: options.signal,
      });
      return {
        ...result,
        attempts,
      };
    } catch (error) {
      if (!(error instanceof GeminiRequestError)) {
        throw new GeminiRequestError(
          "provider_error",
          false,
          "Gemini request failed unexpectedly."
        );
      }
      lastError = error;
      if (!error.retryable || attempts >= maxAttempts) {
        throw error;
      }
    }
  }

  throw (
    lastError ??
    new GeminiRequestError(
      "provider_error",
      false,
      "Gemini request failed unexpectedly."
    )
  );
}
