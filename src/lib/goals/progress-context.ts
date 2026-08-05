import type { GoalProgressSnapshot } from "@/lib/goals/progress";
import type { CompletionDateFact } from "@/lib/goals/types";

export interface ProgressContextResponse {
  schemaVersion: "1";
  asOfDate: string;
  timezone: string;
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
const progressContextCache = new Map<
  string,
  { expiresAt: number; payload: ProgressContextResponse }
>();

export async function fetchProgressContext({
  asOfDate,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  viewDate,
  factsFrom,
  factsTo,
  forceRefresh = false,
}: ProgressContextRequest): Promise<ProgressContextResponse> {
  const search = new URLSearchParams({ asOfDate, timezone });
  if (viewDate) {
    search.set("viewDate", viewDate);
  }
  if (factsFrom && factsTo) {
    search.set("factsFrom", factsFrom);
    search.set("factsTo", factsTo);
  }
  const cacheKey = search.toString();
  const cached = progressContextCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const response = await fetch(`/api/progress/context?${search.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = (await response.json()) as
    | ProgressContextResponse
    | { code?: string; message?: string; correlationId?: string };

  if (!response.ok || !("summaries" in payload)) {
    throw new Error(
      "message" in payload && payload.message
        ? payload.message
        : "Goal progress could not be loaded."
    );
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
