export interface ProgressContextFact {
  goal_id: string;
  completed_on: string;
  source: "manual" | "linked_cascade";
}

export interface ProgressContextSummary {
  goalId: string;
  admissibleCompletionCount: number;
  creditedUnitCount: number;
  expectedUnitCount: number;
  percent: number;
  lifecycle: "upcoming" | "active" | "ended" | "archived";
  outcome: "in_progress" | "achieved" | "ended_with_shortfall";
  placementTerminal: boolean;
  currentStreak: number;
  longestStreak: number;
  milestoneDates: string[];
}

export interface ProgressContextResponse {
  schemaVersion: "1";
  asOfDate: string;
  timezone: string;
  weekStartsOn: number;
  summaries: ProgressContextSummary[];
  facts: ProgressContextFact[];
  truncated: false;
  correlationId: string;
}

export interface ProgressContextRequest {
  asOfDate: string;
  timezone?: string;
  viewDate?: string;
  factsFrom?: string;
  factsTo?: string;
  subjectUserId?: string;
  forceRefresh?: boolean;
}

export function buildProgressContextQuery({
  asOfDate,
  timezone,
  viewDate,
  factsFrom,
  factsTo,
  subjectUserId,
}: Pick<
  ProgressContextRequest,
  "asOfDate" | "timezone" | "viewDate" | "factsFrom" | "factsTo" | "subjectUserId"
>) {
  const query = new URLSearchParams({ asOfDate, timezone: timezone ?? "UTC" });
  if (viewDate) {
    query.set("viewDate", viewDate);
  }
  if (factsFrom && factsTo) {
    query.set("factsFrom", factsFrom);
    query.set("factsTo", factsTo);
  }
  if (subjectUserId) {
    query.set("subjectUserId", subjectUserId);
  }
  return query;
}
