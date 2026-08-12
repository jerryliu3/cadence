import type { GoalProgressSnapshot } from "@/lib/goals/progress";
import type { CompletionDateFact } from "@/lib/goals/types";
import {
  getApiErrorMessage,
  getJson,
  isApiClientError,
  isApiClientTransportError,
} from "@/lib/api/client";
import {
  readTabDataCache,
  TAB_DATA_CACHE_TTL_MS,
  writeTabDataCache,
} from "@/lib/cache/tab-data-cache";
import { resolveUserTimezone } from "@/lib/dates/timezone";

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

const PROGRESS_CONTEXT_CACHE_TTL_MS = TAB_DATA_CACHE_TTL_MS;
const PROGRESS_CONTEXT_REQUEST_TIMEOUT_MS = 15_000;
const PROGRESS_CONTEXT_TIMEOUT_MESSAGE =
  "Goal progress request timed out. Please try again.";
const PROGRESS_CONTEXT_CACHE_PREFIX = "progress-context:";

export class ProgressContextAuthenticationError extends Error {
  readonly code = "authentication_required";
  readonly correlationId?: string;

  constructor(message: string, correlationId?: string) {
    super(message);
    this.name = "ProgressContextAuthenticationError";
    this.correlationId = correlationId;
  }
}

export function isProgressContextAuthenticationError(
  error: unknown
): error is ProgressContextAuthenticationError {
  return error instanceof ProgressContextAuthenticationError;
}

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
  timezone = resolveUserTimezone(),
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
  const cacheKey = `${PROGRESS_CONTEXT_CACHE_PREFIX}${query.toString()}`;
  const cached = readTabDataCache<ProgressContextResponse>(cacheKey);
  if (!forceRefresh && cached) {
    return cached;
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
    if (isApiClientError(error) && error.code === "authentication_required") {
      throw new ProgressContextAuthenticationError(
        error.message,
        error.correlationId
      );
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
  writeTabDataCache(cacheKey, payload, PROGRESS_CONTEXT_CACHE_TTL_MS);
  return payload;
}

export function progressSummaryMap(context: ProgressContextResponse | null) {
  return new Map(
    (context?.summaries ?? []).map((summary) => [summary.goalId, summary])
  );
}
