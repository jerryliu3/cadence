import { getAnchoredPeriod } from "@/lib/goals/periods";
import { getAdmissibleCompletions } from "@/lib/goals/admissible";
import type {
  PlannerCanonicalSnapshot,
  PlannerActiveItemRow,
  PlannerItemRow,
} from "@/lib/planner/context-loader";
import {
  draftCommandEntryKey,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";
import { resolvePlannerEffectiveScheduledTime } from "@/lib/planner/schedule-time";
import type { PlannerBaseAssignment } from "@/lib/planner/work-units";

export class PlannerDirectDraftValidationError extends Error {
  constructor(
    readonly code:
      | "draft_item_unknown"
      | "draft_item_stale"
      | "draft_item_unmovable"
      | "draft_destination_invalid"
      | "draft_destination_conflict",
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "PlannerDirectDraftValidationError";
  }
}

function assignmentKey(assignment: { goalId: string; unitKey: string }) {
  return draftCommandEntryKey(assignment);
}

function completedUnitKeysForGoal({
  snapshot,
  goalId,
  persistedItems,
  asOfDate,
}: {
  snapshot: PlannerCanonicalSnapshot;
  goalId: string;
  persistedItems: PlannerItemRow[];
  asOfDate: string;
}) {
  const goal = snapshot.goals.find((candidate) => candidate.id === goalId);
  if (!goal) {
    return new Set<string>();
  }
  const requirement = normalizeGoalRequirement(goal).requirement;
  const completions = getAdmissibleCompletions(
    goal,
    snapshot.completions.filter(
      (completion) => completion.goal_id === goal.id
    ),
    { asOfDate }
  );
  const completed = new Set<string>();
  if (requirement.kind === "milestone_sequence") {
    for (
      let ordinal = 1;
      ordinal <= Math.min(requirement.targetCount, completions.length);
      ordinal += 1
    ) {
      completed.add(`milestone:${ordinal}`);
    }
    return completed;
  }
  if (requirement.kind === "cadence") {
    for (const item of persistedItems.filter(
      (candidate) => candidate.goal_id === goal.id
    )) {
      const period = getAnchoredPeriod(
        goal.start_date,
        requirement.interval,
        item.scheduled_date,
        {
          weekStartsOn: snapshot.preferences?.default_policy.weekStartsOn,
        }
      );
      if (
        completions.some(
          (completion) =>
            completion.completed_on >= period.start &&
            completion.completed_on <= period.end
        )
      ) {
        completed.add(item.unit_key);
      }
    }
    return completed;
  }

  const scheduledDateByUnitKey = new Map(
    persistedItems
      .filter((item) => item.goal_id === goal.id)
      .map((item) => [item.unit_key, item.scheduled_date])
  );
  const usedCompletionIds = new Set<string>();
  for (let ordinal = 1; ordinal <= requirement.targetCount; ordinal += 1) {
    const unitKey = `total:${ordinal}`;
    const scheduledDate = scheduledDateByUnitKey.get(unitKey);
    if (!scheduledDate) {
      continue;
    }
    const exact = completions.find(
      (completion) =>
        !usedCompletionIds.has(completion.id) &&
        completion.completed_on === scheduledDate
    );
    if (exact) {
      usedCompletionIds.add(exact.id);
      completed.add(unitKey);
    }
  }
  const remainingCompletions = completions.filter(
    (completion) => !usedCompletionIds.has(completion.id)
  );
  let completionIndex = 0;
  for (
    let ordinal = 1;
    ordinal <= requirement.targetCount &&
    completionIndex < remainingCompletions.length;
    ordinal += 1
  ) {
    const unitKey = `total:${ordinal}`;
    if (completed.has(unitKey)) {
      continue;
    }
    completed.add(unitKey);
    completionIndex += 1;
  }
  return completed;
}

export function buildDirectDraftPersistence({
  snapshot,
  commands,
  asOfDate,
  persistedItems,
}: {
  snapshot: PlannerCanonicalSnapshot;
  commands: PlannerDraftCommand[];
  asOfDate: string;
  persistedItems?: PlannerItemRow[];
}) {
  const goalById = new Map(snapshot.goals.map((goal) => [goal.id, goal]));
  const activeGoalByPlanGoalId = new Map(
    (snapshot.activePlan?.goals ?? []).map((goal) => [goal.id, goal])
  );
  const canonicalAssignmentByKey = new Map(
    (snapshot.activePlan?.basePlan.assignments ?? []).map((assignment) => [
      assignmentKey(assignment),
      assignment,
    ])
  );
  const activeEntryByItemId = new Map<
    string,
    {
      key: string;
      goalId: string;
      unitKey: string;
      assignment: PlannerBaseAssignment;
      activeItem: PlannerActiveItemRow;
    }
  >();
  for (const item of snapshot.activePlan?.items ?? []) {
    const activeGoal = activeGoalByPlanGoalId.get(item.plan_goal_id);
    const goalId = activeGoal?.original_goal_id ?? item.plan_goal_id;
    const key = draftCommandEntryKey({ goalId, unitKey: item.unit_key });
    const assignment = canonicalAssignmentByKey.get(key);
    if (!assignment) {
      continue;
    }
    activeEntryByItemId.set(item.id, {
      key,
      goalId,
      unitKey: item.unit_key,
      assignment,
      activeItem: item,
    });
  }
  const activeItemByKey = new Map(
    Array.from(activeEntryByItemId.values()).map((entry) => [
      entry.key,
      entry.activeItem,
    ])
  );
  const completedUnitKeys = new Set(
    Object.values(snapshot.activePlan?.basePlan.completionToUnit ?? {}).map(
      (unit) => assignmentKey(unit)
    )
  );
  const allPersistedItems =
    persistedItems ??
    (snapshot.activePlan?.items ?? []).flatMap((item) => {
      const activeGoal = snapshot.activePlan?.goals.find(
        (goal) => goal.id === item.plan_goal_id
      );
      return item.scheduled_date
        ? [
            {
              goal_id: activeGoal?.original_goal_id ?? item.plan_goal_id,
              unit_key: item.unit_key,
              scheduled_date: item.scheduled_date,
            } as PlannerItemRow,
          ]
        : [];
    });
  const touchedGoalIds = new Set<string>();
  for (const command of commands) {
    const activeEntry = activeEntryByItemId.get(command.itemId);
    if (activeEntry) {
      touchedGoalIds.add(activeEntry.goalId);
    }
  }
  for (const goalId of touchedGoalIds) {
    for (const unitKey of completedUnitKeysForGoal({
      snapshot,
      goalId,
      persistedItems: allPersistedItems,
      asOfDate,
    })) {
      completedUnitKeys.add(
        assignmentKey({
          goalId,
          unitKey,
        })
      );
    }
  }

  const projectedDateByKey = new Map(
    Array.from(canonicalAssignmentByKey.values()).map((assignment) => [
      assignmentKey(assignment),
      assignment.scheduledDate,
    ])
  );
  const projectedTimeByKey = new Map(
    Array.from(canonicalAssignmentByKey.values()).map((assignment) => [
      assignmentKey(assignment),
      assignment.scheduledTimeOverride ?? null,
    ])
  );

  for (const command of sortPlannerDraftCommands(commands)) {
    const activeEntry = activeEntryByItemId.get(command.itemId);
    if (!activeEntry) {
      throw new PlannerDirectDraftValidationError(
        "draft_item_stale",
        "A planner session changed after this draft was created. Refresh and try again.",
        { itemId: command.itemId }
      );
    }
    const {
      key,
      goalId,
      unitKey,
      assignment,
      activeItem,
    } = activeEntry;
    if (command.goalId !== goalId || command.unitKey !== unitKey) {
      throw new PlannerDirectDraftValidationError(
        "draft_item_stale",
        "A planner session changed after this draft was created. Refresh and try again.",
        {
          itemId: command.itemId,
          commandGoalId: command.goalId,
          commandUnitKey: command.unitKey,
          goalId,
          unitKey,
        }
      );
    }
    const goal = goalById.get(goalId);
    if (!goal) {
      throw new PlannerDirectDraftValidationError(
        "draft_item_unknown",
        "That planner session is no longer available. Refresh and try again.",
        { itemId: command.itemId, goalId, unitKey }
      );
    }
    const requirement = normalizeGoalRequirement(goal).requirement;
    const ordinalMatch =
      requirement.kind === "milestone_sequence"
        ? /^milestone:([1-9][0-9]*)$/.exec(unitKey)
        : requirement.kind === "deadline_total"
          ? /^total:([1-9][0-9]*)$/.exec(unitKey)
          : null;
    const identityIsCurrent =
      requirement.kind === "cadence"
        ? unitKey ===
          `cadence:${
            getAnchoredPeriod(
              goal.start_date,
              requirement.interval,
              assignment.scheduledDate ?? goal.start_date,
              {
                weekStartsOn:
                  snapshot.preferences?.default_policy.weekStartsOn,
              }
            ).periodKey
          }`
        : Boolean(
            ordinalMatch &&
              Number(ordinalMatch[1]) <= requirement.targetCount
          );
    if (!identityIsCurrent) {
      throw new PlannerDirectDraftValidationError(
        "draft_item_stale",
        "A goal changed after this draft was created. Refresh and try again.",
        { itemId: command.itemId, goalId, unitKey }
      );
    }
    const itemIsImmovable =
      assignment.locked ||
      completedUnitKeys.has(key) ||
      activeItem.credit_state !== "uncredited" ||
      activeItem.classification === "satisfied_elsewhere" ||
      assignment.scheduledDate === null;
    if (command.kind === "set_item_time_override") {
      if (itemIsImmovable) {
        throw new PlannerDirectDraftValidationError(
          "draft_item_unmovable",
          "Completed or locked sessions cannot be changed.",
          { itemId: command.itemId, goalId, unitKey }
        );
      }
      projectedTimeByKey.set(key, command.localTime);
      continue;
    }
    if (command.kind === "clear_item_time_override") {
      if (itemIsImmovable) {
        throw new PlannerDirectDraftValidationError(
          "draft_item_unmovable",
          "Completed or locked sessions cannot be changed.",
          { itemId: command.itemId, goalId, unitKey }
        );
      }
      projectedTimeByKey.set(key, null);
      continue;
    }
    if (command.kind !== "move_item") {
      continue;
    }
    if (
      assignment.scheduledDate !== command.sourceDate
    ) {
      throw new PlannerDirectDraftValidationError(
        "draft_item_stale",
        "That session moved after this draft was created. Refresh and try again.",
        { itemId: command.itemId, goalId, unitKey }
      );
    }
    if (
      itemIsImmovable
    ) {
      throw new PlannerDirectDraftValidationError(
        "draft_item_unmovable",
        "Completed or locked sessions cannot be moved.",
        { itemId: command.itemId, goalId, unitKey }
      );
    }
    if (command.scheduledDate !== null) {
      const creditWindow =
        requirement.kind === "cadence"
          ? getAnchoredPeriod(
              goal.start_date,
              requirement.interval,
              assignment.scheduledDate ?? command.sourceDate,
              {
                weekStartsOn:
                  snapshot.preferences?.default_policy.weekStartsOn,
              }
            )
          : {
              start: goal.start_date,
              end: goal.end_date ?? goal.start_date,
            };
      const moveWindow = {
        start: creditWindow.start > asOfDate ? creditWindow.start : asOfDate,
        end: creditWindow.end,
      };
      if (
        command.scheduledDate < moveWindow.start ||
        command.scheduledDate > moveWindow.end
      ) {
        throw new PlannerDirectDraftValidationError(
          "draft_destination_invalid",
          "That date is outside this session's allowed move range.",
          {
            itemId: command.itemId,
            goalId,
            unitKey,
            scheduledDate: command.scheduledDate,
            moveWindow,
          }
        );
      }
      const conflictingAssignment = Array.from(
        canonicalAssignmentByKey.values()
      ).find(
        (candidate) =>
          candidate.goalId === goalId &&
          assignmentKey(candidate) !== key &&
          projectedDateByKey.get(assignmentKey(candidate)) ===
            command.scheduledDate
      );
      const completionConflict = snapshot.completions.some(
        (completion) =>
          completion.goal_id === goalId &&
          completion.completed_on === command.scheduledDate
      );
      if (conflictingAssignment || completionConflict) {
        throw new PlannerDirectDraftValidationError(
          "draft_destination_conflict",
          "That goal already has a session or completion on the selected date.",
          {
            itemId: command.itemId,
            goalId,
            unitKey,
            scheduledDate: command.scheduledDate,
          }
        );
      }
    }
    projectedDateByKey.set(key, command.scheduledDate);
  }

  return Array.from(canonicalAssignmentByKey.values()).map((assignment) => {
    const key = assignmentKey(assignment);
    const goal = goalById.get(assignment.goalId)!;
    const scheduledDate = projectedDateByKey.get(key) ?? null;
    const scheduledTimeOverride = projectedTimeByKey.get(key) ?? null;
    const resolvedTime = resolvePlannerEffectiveScheduledTime({
      scheduledDate,
      goalDefaultLocalTime: goal.default_local_time ?? null,
      scheduledTimeOverride,
    });
    return {
      goal_id: assignment.goalId,
      unit_key: assignment.unitKey,
      original_scheduled_date:
        activeItemByKey.get(key)?.original_scheduled_date ??
        assignment.scheduledDate,
      scheduled_date: scheduledDate,
      scheduled_time_override: scheduledTimeOverride,
      effective_scheduled_local_time:
        resolvedTime.effectiveScheduledLocalTime,
      effective_scheduled_at_local: resolvedTime.effectiveScheduledAtLocal,
      locked: assignment.locked,
    };
  });
}
