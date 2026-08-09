import type { GoalProgressSnapshot } from "@/lib/goals/progress";
import type { CompletionDateFact } from "@/lib/goals/types";
import {
  getApiErrorMessage,
  getJson,
  isApiClientTransportError,
} from "@/lib/api/client";

export interface ProgressContextResponse {
  schemaVersion: "1";
  asOfDate: string;
  timezone: string;
  weekStartsOn: number;
  summaries: GoalProgressSnapshot[];
  facts: CompletionDateFact[];
  truncated: false;
  correlationId: string;
}

export interface ProgressContextRequest {
  asOfDate: string;
  timezone?: string;
  viewDate?: string;
  factsFrom?: string;
  factsTo?: string;
  forceRefresh?: boolean;
}

const PROGRESS_CONTEXT_CACHE_TTL_MS = 15_000;
const PROGRESS_CONTEXT_REQUEST_TIMEOUT_MS = 15_000;
const PROGRESS_CONTEXT_TIMEOUT_MESSAGE =
  "Goal progress request timed out. Please try again.";
const progressContextCache = new Map<
  string,
  { expiresAt: number; payload: ProgressContextResponse }
>();

function buildProgressContextQuery({
  asOfDate,
  timezone,
  viewDate,
  factsFrom,
  factsTo,
}: Pick<
  ProgressContextRequest,
  "asOfDate" | "timezone" | "viewDate" | "factsFrom" | "factsTo"
>) {
  const query = new URLSearchParams({ asOfDate, timezone: timezone ?? "UTC" });
  if (viewDate) {
    query.set("viewDate", viewDate);
  }
  if (factsFrom && factsTo) {
    query.set("factsFrom", factsFrom);
    query.set("factsTo", factsTo);
  }
  return query;
}

function isProgressContextResponse(payload: unknown): payload is ProgressContextResponse {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return "summaries" in payload && "facts" in payload;
}

export async function fetchProgressContext({
  asOfDate,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  viewDate,
  factsFrom,
  factsTo,
  forceRefresh = false,
}: ProgressContextRequest): Promise<ProgressContextResponse> {
  const query = buildProgressContextQuery({
    asOfDate,
    timezone,
    viewDate,
    factsFrom,
    factsTo,
  });
  const cacheKey = query.toString();
  const cached = progressContextCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  let payload: ProgressContextResponse;
  try {
    payload = await getJson<ProgressContextResponse>("/api/progress/context", {
      query,
      timeoutMs: PROGRESS_CONTEXT_REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    if (isApiClientTransportError(error) && error.reason === "timeout") {
      throw new Error(PROGRESS_CONTEXT_TIMEOUT_MESSAGE);
    }
    throw new Error(
      getApiErrorMessage(error, "Goal progress could not be loaded.")
    );
  }
  if (!isProgressContextResponse(payload)) {
    throw new Error("Goal progress response was malformed.");
  }
  if (payload.truncated !== false) {
    throw new Error("Goal progress response was unexpectedly truncated.");
  }
  progressContextCache.set(cacheKey, {
    expiresAt: Date.now() + PROGRESS_CONTEXT_CACHE_TTL_MS,
    payload,
  });
  return payload;
}

export function progressSummaryMap(context: ProgressContextResponse | null) {
  return new Map(
    (context?.summaries ?? []).map((summary) => [summary.goalId, summary])
  );
}
