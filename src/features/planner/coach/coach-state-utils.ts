import type {
  CoachConversationSummary,
  CoachMessage,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import { buildCoachSessionKey } from "@/features/planner/coach-session";

export function buildCoachFocusGoalIds({
  workUnits,
  goalTitles,
}: {
  workUnits: PlannerWorkUnit[] | null | undefined;
  goalTitles: Record<string, string> | undefined;
}) {
  const ids = new Set<string>();
  for (const unit of workUnits ?? []) {
    ids.add(unit.originalGoalId);
  }
  if (ids.size === 0) {
    for (const goalId of Object.keys(goalTitles ?? {})) {
      ids.add(goalId);
    }
  }
  return Array.from(ids).slice(0, 20);
}

export function countAssignmentChanges({
  previousWorkUnits,
  refreshedWorkUnits,
}: {
  previousWorkUnits: PlannerWorkUnit[] | undefined;
  refreshedWorkUnits: PlannerWorkUnit[];
}) {
  const previousDatesByKey = new Map(
    (previousWorkUnits ?? []).map((unit) => [
      `${unit.originalGoalId}:${unit.unitKey}`,
      unit.scheduledDate,
    ])
  );
  const refreshedDatesByKey = new Map(
    refreshedWorkUnits.map((unit) => [
      `${unit.originalGoalId}:${unit.unitKey}`,
      unit.scheduledDate,
    ])
  );
  let assignmentChanges = 0;
  for (const key of new Set([...previousDatesByKey.keys(), ...refreshedDatesByKey.keys()])) {
    if (previousDatesByKey.get(key) !== refreshedDatesByKey.get(key)) {
      assignmentChanges += 1;
    }
  }
  return assignmentChanges;
}

export function resolveSavedConversationSelection({
  currentId,
  conversations,
}: {
  currentId: string;
  conversations: CoachConversationSummary[];
}) {
  if (currentId && conversations.some((conversation) => conversation.id === currentId)) {
    return currentId;
  }
  return conversations[0]?.id ?? "";
}

export function isTemporarilyUnavailableSavedConversationError(message: string) {
  return message
    .toLowerCase()
    .includes("saved coach conversations are temporarily unavailable");
}

export function buildCoachGoalHint({
  focusGoalIds,
  goalTitles,
}: {
  focusGoalIds: string[];
  goalTitles: Record<string, string> | undefined;
}) {
  if (focusGoalIds.length === 0) {
    return "There are no focus goals in the current planner scope.";
  }

  return `Current focus goals: ${focusGoalIds
    .map((goalId) => `${goalId} (${goalTitles?.[goalId] ?? "Untitled goal"})`)
    .join(", ")}.`;
}

export function buildCoachCalendarEditsPrompt(goalHint: string) {
  return `Please convert your guidance into concrete calendar intent I can apply now. Make safe assumptions and keep them explicit. ${goalHint} Use action="apply" for concrete scheduling edits. Restrict edits to restWeekdays and blackout ranges; use action="needs_goal" when the request cannot be represented by those planner fields.`;
}

export function clearPersistedCoachSession({
  scopeMonth,
  timezone,
}: {
  scopeMonth?: string;
  timezone?: string;
}) {
  if (!scopeMonth || !timezone) {
    return;
  }
  sessionStorage.removeItem(buildCoachSessionKey(scopeMonth, timezone));
}

export function computeHasCoachConversationState({
  coachMessages,
  coachWarnings,
  coachRecommendations,
  coachUnresolvedQuestions,
  coachContextEvents,
  coachInput,
}: {
  coachMessages: CoachMessage[];
  coachWarnings: string[];
  coachRecommendations: string[];
  coachUnresolvedQuestions: string[];
  coachContextEvents: string[];
  coachInput: string;
}) {
  return (
    coachMessages.length > 0 ||
    coachWarnings.length > 0 ||
    coachRecommendations.length > 0 ||
    coachUnresolvedQuestions.length > 0 ||
    coachContextEvents.length > 0 ||
    coachInput.trim().length > 0
  );
}
