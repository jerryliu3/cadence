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
}

export async function fetchProgressContext({
  asOfDate,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  viewDate,
  factsFrom,
  factsTo,
}: ProgressContextRequest): Promise<ProgressContextResponse> {
  const search = new URLSearchParams({ asOfDate, timezone });
  if (viewDate) {
    search.set("viewDate", viewDate);
  }
  if (factsFrom && factsTo) {
    search.set("factsFrom", factsFrom);
    search.set("factsTo", factsTo);
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
  return payload;
}

export function progressSummaryMap(context: ProgressContextResponse | null) {
  return new Map(
    (context?.summaries ?? []).map((summary) => [summary.goalId, summary])
  );
}
