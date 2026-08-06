import { z } from "zod";

const defaultModel = "gemini-3.5-flash";
const defaultFallbackModels = ["gemini-3.5-flash-lite"];

const geminiResponseSchema = z.object({
  candidates: z.array(
    z.object({
      finishReason: z.string().optional(),
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
  modelFallbacks?: string[];
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

function parseModelList(raw: string | undefined) {
  return raw
    ? raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];
}

function buildModelCandidates(
  primaryModel: string,
  fallbacks: string[]
): string[] {
  const ordered = [primaryModel, ...fallbacks];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const model of ordered) {
    const normalized = model.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function appendModelAttemptHistory(error: GeminiRequestError, modelsTried: string[]) {
  if (modelsTried.length <= 1) {
    return error;
  }
  return new GeminiRequestError(
    error.code,
    error.retryable,
    `${error.message} (models tried: ${modelsTried.join(", ")})`
  );
}

function extractBalancedJsonBlocks(text: string, maxBlocks = 24) {
  const isOpening = (char: string) => char === "{" || char === "[";
  const matchingClosing = (char: string) => (char === "{" ? "}" : "]");
  const isClosing = (char: string) => char === "}" || char === "]";
  const blocks: string[] = [];

  for (let start = 0; start < text.length; start += 1) {
    if (blocks.length >= maxBlocks) {
      break;
    }
    if (!isOpening(text[start])) {
      continue;
    }
    const stack: string[] = [matchingClosing(text[start])];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
        continue;
      }
      if (isOpening(char)) {
        stack.push(matchingClosing(char));
        continue;
      }
      if (isClosing(char)) {
        const expected = stack.at(-1);
        if (char !== expected) {
          break;
        }
        stack.pop();
        if (stack.length === 0) {
          blocks.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return blocks;
}

function scoreParsedCandidate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Number.NEGATIVE_INFINITY;
  }
  const record = value as Record<string, unknown>;
  let score = 0;
  if ("schemaVersion" in record) {
    score += 8;
    if (record.schemaVersion === "1") {
      score += 4;
    } else if (record.schemaVersion === 1) {
      score += 2;
    }
  }
  if ("phase" in record) {
    score += 5;
  }
  if (typeof record.reply === "string" && record.reply.trim().length > 0) {
    score += 8;
  }
  if (
    "proposal" in record &&
    record.proposal !== null &&
    typeof record.proposal === "object" &&
    !Array.isArray(record.proposal)
  ) {
    score += 6;
  }
  if ("recommendations" in record && Array.isArray(record.recommendations)) {
    score += 3;
  }
  if ("assessments" in record && Array.isArray(record.assessments)) {
    score += 2;
  }
  if ("policyPatches" in record && Array.isArray(record.policyPatches)) {
    score += 2;
  }
  if ("unresolvedQuestions" in record && Array.isArray(record.unresolvedQuestions)) {
    score += 2;
  }
  return score;
}

function parseCandidateJson(candidate: string) {
  const parseObjectLike = (raw: string) => {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object") {
      return parsed;
    }
    if (
      typeof parsed === "string" &&
      /^[\[{]/.test(parsed.trim()) &&
      /[\]}]$/.test(parsed.trim())
    ) {
      const nested = JSON.parse(parsed.trim()) as unknown;
      if (nested !== null && typeof nested === "object") {
        return nested;
      }
    }
    return null;
  };

  for (const variant of [candidate, candidate.replace(/^\uFEFF/, "")]) {
    try {
      const parsed = parseObjectLike(variant);
      if (parsed !== null) {
        return parsed;
      }
    } catch {
      // Try the next parse variant.
    }
  }
  return null;
}

function strictParseCandidateJson(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new GeminiRequestError(
      "empty_response",
      true,
      "Gemini returned an empty candidate."
    );
  }

  const candidates = new Set<string>();
  candidates.add(trimmed);

  const fencedMatches = trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fencedMatches) {
    const inner = match[1]?.trim();
    if (inner) {
      candidates.add(inner);
    }
  }

  const balancedBlocks = extractBalancedJsonBlocks(trimmed);
  for (const balanced of balancedBlocks) {
    candidates.add(balanced);
  }

  const parsedCandidates: unknown[] = [];
  for (const candidate of candidates) {
    const parsed = parseCandidateJson(candidate);
    if (parsed !== null) {
      parsedCandidates.push(parsed);
    }
  }

  if (parsedCandidates.length > 0) {
    let bestCandidate = parsedCandidates[0];
    let bestScore = scoreParsedCandidate(bestCandidate);
    for (let index = 1; index < parsedCandidates.length; index += 1) {
      const score = scoreParsedCandidate(parsedCandidates[index]);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = parsedCandidates[index];
      }
    }
    return bestCandidate;
  }

  const preview =
    trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
  throw new GeminiRequestError(
    "invalid_response",
    true,
    `Gemini candidate text was not valid JSON. Preview: ${preview}`
  );
}

function extractFirstTextCandidate(responseJson: unknown): {
  text: string;
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const parsed = geminiResponseSchema.safeParse(responseJson);
  if (!parsed.success) {
    throw new GeminiRequestError(
      "invalid_response",
      true,
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
        finishReason: candidate.finishReason ?? null,
        inputTokens: parsed.data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens:
          parsed.data.usageMetadata?.candidatesTokenCount ??
          parsed.data.usageMetadata?.totalTokenCount ??
          0,
        totalTokens: parsed.data.usageMetadata?.totalTokenCount ?? 0,
      };
    }
  }

  const finishReasons = parsed.data.candidates
    .map((candidate) => candidate.finishReason?.trim())
    .filter((reason): reason is string => Boolean(reason));
  throw new GeminiRequestError(
    "empty_response",
    true,
    finishReasons.length > 0
      ? `Gemini response contained no text candidates (finish reasons: ${finishReasons.join(", ")}).`
      : "Gemini response contained no text candidates."
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
    const errorBody = await response.text().catch(() => "");
    const compactErrorBody = errorBody
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    throw new GeminiRequestError(
      "provider_error",
      isRetryableHttpStatus(response.status),
      compactErrorBody
        ? `Gemini request failed (${response.status}): ${compactErrorBody}`
        : `Gemini request failed (${response.status}).`
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
      true,
      "Gemini response body was not valid JSON."
    );
  }

  const candidate = extractFirstTextCandidate(responseJson);
  let candidateJson: unknown;
  try {
    candidateJson = strictParseCandidateJson(candidate.text);
  } catch (error) {
    const finishReason = candidate.finishReason?.toUpperCase() ?? null;
    if (
      error instanceof GeminiRequestError &&
      finishReason &&
      (finishReason.includes("MAX_TOKENS") || finishReason.includes("LENGTH"))
    ) {
      throw new GeminiRequestError(
        "invalid_response",
        true,
        `Gemini candidate JSON was truncated (finish reason: ${finishReason}).`
      );
    }
    throw error;
  }
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
  const primaryModel =
    options.model?.trim() || process.env.GEMINI_MODEL?.trim() || defaultModel;
  const envFallbackModels = parseModelList(process.env.GEMINI_FALLBACK_MODELS);
  const fallbackModels =
    options.modelFallbacks ??
    (envFallbackModels.length > 0 ? envFallbackModels : defaultFallbackModels);
  const modelCandidates = buildModelCandidates(
    primaryModel,
    fallbackModels
  );
  const temperature = options.temperature ?? 0.2;
  const maxOutputTokens = options.maxOutputTokens ?? 8_192;
  const maxResponseBytes = options.maxResponseBytes ?? 256 * 1024;
  const startedAt = Date.now();

  let attempts = 0;
  const modelsTried: string[] = [];
  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
    const model = modelCandidates[modelIndex];
    modelsTried.push(model);

    for (let modelAttempt = 0; modelAttempt < maxAttempts; modelAttempt += 1) {
      attempts += 1;
      const elapsed = Date.now() - startedAt;
      const remaining = totalTimeoutMs - elapsed;
      if (remaining <= 0) {
        throw appendModelAttemptHistory(
          new GeminiRequestError("timeout", false, "Gemini request timed out."),
          modelsTried
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
        const normalizedError =
          error instanceof GeminiRequestError
            ? error
            : new GeminiRequestError(
                "provider_error",
                false,
                "Gemini request failed unexpectedly."
              );
        const hasRetryOnSameModel =
          normalizedError.retryable &&
          normalizedError.code !== "provider_error" &&
          modelAttempt < maxAttempts - 1;
        if (hasRetryOnSameModel) {
          continue;
        }

        const hasNextModel = modelIndex < modelCandidates.length - 1;
        const canTryFallbackModel =
          hasNextModel &&
          (normalizedError.code === "provider_error" ||
            normalizedError.code === "timeout" ||
            normalizedError.code === "invalid_response" ||
            normalizedError.code === "empty_response");
        if (canTryFallbackModel) {
          break;
        }

        throw appendModelAttemptHistory(normalizedError, modelsTried);
      }
    }
  }

  throw new GeminiRequestError(
    "provider_error",
    false,
    `Gemini request failed for all configured models (${modelCandidates.join(", ")}).`
  );
}
