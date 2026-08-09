export interface CompletionDispatchInput {
  requirementKind:
    | "milestone_sequence"
    | "cadence"
    | "deadline_total";
  targetedRecurring: boolean;
  activePlanMembership: boolean;
  matchingItemState:
    | "none"
    | "actionable"
    | "satisfied_elsewhere"
    | "historical";
  selectedDateState: "past" | "today" | "future";
  existingExactFact: boolean;
  desiredFactState: "present" | "absent";
}

export interface CompletionDispatchDecision {
  route:
    | "item_date"
    | "plan_goal_date"
    | "canonical_exact_date"
    | "legacy_period"
    | "disabled";
  exactDateOnly: boolean;
  allowed: boolean;
  reason:
    | "allowed"
    | "satisfied_elsewhere"
    | "future_creation"
    | "legacy_period_semantics";
}

type CompletionDispatchRoute = CompletionDispatchDecision["route"];

export interface PlannerDigestExpectation {
  expectedDigest: string;
}

export interface PlannerItemDateFactExpectation
  extends PlannerDigestExpectation {
  itemId: string;
}

export type PlannerGoalDateFactExpectation = PlannerDigestExpectation;

export interface ExecuteCompletionDispatchInput {
  decision: CompletionDispatchDecision;
  desiredFactState: "present" | "absent";
  goalId: string;
  date: string;
  timezone: string;
  plannerItemExpectation?: PlannerItemDateFactExpectation;
  plannerGoalExpectation?: PlannerGoalDateFactExpectation;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export interface CompletionDispatchExecutionResult {
  ok: boolean;
  message: string | null;
}

const DEFAULT_COMPLETION_DISPATCH_TIMEOUT_MS = 15_000;
const COMPLETION_TIMEOUT_MESSAGE =
  "The completion request timed out. Please try again.";

function parseErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message.trim().length > 0
  ) {
    return payload.message;
  }
  return fallback;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function fallbackErrorForRoute(route: CompletionDispatchRoute) {
  switch (route) {
    case "canonical_exact_date":
      return "The exact-date completion could not be updated.";
    case "legacy_period":
      return "The completion could not be updated.";
    case "item_date":
    case "plan_goal_date":
      return "Planner completion update failed.";
    default:
      return null;
  }
}

function buildCompletionDispatchBody({
  route,
  goalId,
  date,
  desiredFactState,
  timezone,
  plannerItemExpectation,
  plannerGoalExpectation,
}: {
  route: CompletionDispatchRoute;
  goalId: string;
  date: string;
  desiredFactState: "present" | "absent";
  timezone: string;
  plannerItemExpectation?: PlannerItemDateFactExpectation;
  plannerGoalExpectation?: PlannerGoalDateFactExpectation;
}) {
  const body: Record<string, unknown> = {
    goalId,
    date,
    desiredFactState,
    timezone,
  };
  if (route === "item_date" && plannerItemExpectation) {
    body.plannerItemExpectation = {
      itemId: plannerItemExpectation.itemId,
      expectedDigest: plannerItemExpectation.expectedDigest,
    };
  }
  if (route === "plan_goal_date" && plannerGoalExpectation) {
    body.plannerGoalExpectation = {
      expectedDigest: plannerGoalExpectation.expectedDigest,
    };
  }
  return body;
}

async function postJsonRoute({
  fetcher,
  route,
  body,
  fallbackError,
  timeoutMs,
}: {
  fetcher: typeof fetch;
  route: string;
  body: Record<string, unknown>;
  fallbackError: string;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetcher(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    return {
      ok: false as const,
      message: isAbortError(error) ? COMPLETION_TIMEOUT_MESSAGE : fallbackError,
    };
  } finally {
    clearTimeout(timeoutId);
  }
  if (response.ok) {
    return { ok: true as const, message: null };
  }
  const payload = await response.json().catch(() => null);
  return {
    ok: false as const,
    message: parseErrorMessage(payload, fallbackError),
  };
}

export function resolveCompletionDispatch({
  targetedRecurring,
  activePlanMembership,
  matchingItemState,
  selectedDateState,
  existingExactFact,
  desiredFactState,
}: CompletionDispatchInput): CompletionDispatchDecision {
  if (matchingItemState === "satisfied_elsewhere") {
    return {
      route: "disabled",
      exactDateOnly: true,
      allowed: false,
      reason: "satisfied_elsewhere",
    };
  }

  let route: CompletionDispatchDecision["route"];
  if (
    activePlanMembership &&
    (matchingItemState === "actionable" ||
      matchingItemState === "historical")
  ) {
    route = "item_date";
  } else if (activePlanMembership) {
    route = "plan_goal_date";
  } else if (targetedRecurring) {
    // A target-total fact belongs to its selected date. Period unmarking could
    // otherwise delete a different legitimate completion in the same period.
    route = "canonical_exact_date";
  } else {
    return {
      route: "legacy_period",
      exactDateOnly: false,
      allowed: true,
      reason: "legacy_period_semantics",
    };
  }

  const isFutureCreation =
    selectedDateState === "future" &&
    desiredFactState === "present" &&
    !existingExactFact;

  return {
    route,
    exactDateOnly: true,
    allowed: !isFutureCreation,
    reason: isFutureCreation ? "future_creation" : "allowed",
  };
}

export async function executeCompletionDispatch({
  decision,
  desiredFactState,
  goalId,
  date,
  timezone,
  plannerItemExpectation,
  plannerGoalExpectation,
  fetcher = fetch,
  timeoutMs = DEFAULT_COMPLETION_DISPATCH_TIMEOUT_MS,
}: ExecuteCompletionDispatchInput): Promise<CompletionDispatchExecutionResult> {
  if (!decision.allowed || decision.route === "disabled") {
    const message =
      decision.reason === "future_creation"
        ? "You can only mark completions for today or a past date."
        : decision.reason === "satisfied_elsewhere"
          ? "This completion is already satisfied by another session."
          : "This completion cannot be changed from here.";
    return {
      ok: false,
      message,
    };
  }

  const fallbackError = fallbackErrorForRoute(decision.route);
  if (fallbackError === null) {
    return {
      ok: false,
      message: "This completion route is not supported.",
    };
  }

  const result = await postJsonRoute({
    fetcher,
    route: "/api/completions",
    body: buildCompletionDispatchBody({
      route: decision.route,
      goalId,
      date,
      desiredFactState,
      timezone,
      plannerItemExpectation,
      plannerGoalExpectation,
    }),
    fallbackError,
    timeoutMs,
  });
  return {
    ok: result.ok,
    message: result.message,
  };
}
