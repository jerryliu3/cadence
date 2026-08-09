import {
  getApiErrorMessage,
  isApiClientTransportError,
  requestJson,
} from "@/lib/api/client";

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

export interface PlannerDigestExpectation {
  expectedDigest: string;
}

export interface PlannerItemDateFactExpectation
  extends PlannerDigestExpectation {
  itemId: string;
}

export type PlannerGoalDateFactExpectation = PlannerDigestExpectation;

export interface ExecuteCompletionDispatchInput {
  decision: ExecutableCompletionDispatchDecision;
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

type ExecutableCompletionRoute = Exclude<
  CompletionDispatchDecision["route"],
  "disabled"
>;

type ExecutableCompletionDispatchDecision = Omit<
  CompletionDispatchDecision,
  "route" | "allowed"
> & {
  route: ExecutableCompletionRoute;
  allowed: true;
};

const DEFAULT_COMPLETION_DISPATCH_TIMEOUT_MS = 15_000;
const COMPLETION_TIMEOUT_MESSAGE =
  "The completion request timed out. Please try again.";

async function postCompletionRoute({
  fetcher,
  body,
  fallbackError,
  timeoutMs,
}: {
  fetcher: typeof fetch;
  body: Record<string, unknown>;
  fallbackError: string;
  timeoutMs: number;
}) {
  try {
    await requestJson<unknown, Record<string, unknown>>({
      path: "/api/completions",
      method: "POST",
      body,
      timeoutMs,
      fetcher,
    });
    return { ok: true as const, message: null };
  } catch (error) {
    if (isApiClientTransportError(error) && error.reason === "timeout") {
      return {
        ok: false as const,
        message: COMPLETION_TIMEOUT_MESSAGE,
      };
    }
    return {
      ok: false as const,
      message: getApiErrorMessage(error, fallbackError),
    };
  }
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
  const body: Record<string, unknown> = {
    goalId,
    date,
    desiredFactState,
    timezone,
  };
  if (decision.route === "item_date" && plannerItemExpectation) {
    body.plannerItemExpectation = {
      itemId: plannerItemExpectation.itemId,
      expectedDigest: plannerItemExpectation.expectedDigest,
    };
  }
  if (decision.route === "plan_goal_date" && plannerGoalExpectation) {
    body.plannerGoalExpectation = {
      expectedDigest: plannerGoalExpectation.expectedDigest,
    };
  }
  const fallbackError =
    decision.route === "canonical_exact_date"
      ? "The exact-date completion could not be updated."
      : decision.route === "legacy_period"
        ? "The completion could not be updated."
        : "Planner completion update failed.";
  return postCompletionRoute({
    fetcher,
    body,
    fallbackError,
    timeoutMs,
  });
}
