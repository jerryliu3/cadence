import { getEntryDisplayTitle, isEntryCredited } from "@/features/planner/calendar-format";
import type {
  DraftItemEdit,
  PlannerActiveGoalSnapshot,
  PlannerActiveItemSnapshot,
  PlannerCompletionFactMarker,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import { draftCommandEntryKey } from "@/lib/planner/draft-commands";

export function buildActiveGoalIndexes(
  activeGoals: PlannerActiveGoalSnapshot[] | undefined
) {
  const byPlanGoalId = new Map<string, PlannerActiveGoalSnapshot>();
  const byOriginalGoalId = new Map<string, PlannerActiveGoalSnapshot>();
  for (const goal of activeGoals ?? []) {
    byPlanGoalId.set(goal.id, goal);
    byOriginalGoalId.set(goal.original_goal_id, goal);
  }
  return {
    byPlanGoalId,
    byOriginalGoalId,
  };
}

export function buildEntriesByDate({
  workUnits,
  activeItems,
  activeGoalsByPlanGoalId,
  activeGoalsByOriginalGoalId,
  goalTitles,
  draftItemEdits,
}: {
  workUnits: PlannerWorkUnit[] | undefined;
  activeItems: PlannerActiveItemSnapshot[] | undefined;
  activeGoalsByPlanGoalId: Map<string, PlannerActiveGoalSnapshot>;
  activeGoalsByOriginalGoalId: Map<string, PlannerActiveGoalSnapshot>;
  goalTitles: Record<string, string> | undefined;
  draftItemEdits: Record<string, DraftItemEdit>;
}) {
  const byDate = new Map<string, Map<string, PlannerDayDetailEntry>>();
  const entryByKey = new Map<string, PlannerDayDetailEntry>();
  const entryDayByKey = new Map<string, string>();

  const setEntryOnDay = (day: string, key: string, entry: PlannerDayDetailEntry) => {
    const existingDay = entryDayByKey.get(key);
    if (existingDay && existingDay !== day) {
      byDate.get(existingDay)?.delete(key);
    }
    const existing = byDate.get(day);
    if (existing) {
      existing.set(key, entry);
    } else {
      const created = new Map<string, PlannerDayDetailEntry>();
      created.set(key, entry);
      byDate.set(day, created);
    }
    entryByKey.set(key, entry);
    entryDayByKey.set(key, day);
  };

  for (const unit of workUnits ?? []) {
    if (!unit.scheduledDate) {
      continue;
    }
    const key = `${unit.originalGoalId}:${unit.unitKey}`;
    setEntryOnDay(unit.scheduledDate, key, {
      key,
      originalGoalId: unit.originalGoalId,
      goalTitle:
        activeGoalsByOriginalGoalId.get(unit.originalGoalId)?.title ??
        goalTitles?.[unit.originalGoalId] ??
        null,
      unitKey: unit.unitKey,
      label: unit.label,
      classification: unit.classification,
      creditState: unit.creditState,
      activeGoal: activeGoalsByOriginalGoalId.get(unit.originalGoalId) ?? null,
      activeItem: null,
    });
  }

  for (const item of activeItems ?? []) {
    const activeGoal = activeGoalsByPlanGoalId.get(item.plan_goal_id) ?? null;
    const originalGoalId = activeGoal?.original_goal_id ?? item.plan_goal_id;
    const key = `${originalGoalId}:${item.unit_key}`;
    const existingEntry = entryByKey.get(key);
    if (existingEntry) {
      const existingDay = entryDayByKey.get(key);
      if (!existingDay) {
        continue;
      }
      setEntryOnDay(existingDay, key, {
        ...existingEntry,
        goalTitle:
          existingEntry.goalTitle ??
          activeGoal?.title ??
          goalTitles?.[originalGoalId] ??
          null,
        activeGoal: existingEntry.activeGoal ?? activeGoal,
        activeItem: item,
      });
      continue;
    }
    if (!item.scheduled_date) {
      continue;
    }
    setEntryOnDay(item.scheduled_date, key, {
      key,
      originalGoalId,
      goalTitle: activeGoal?.title ?? goalTitles?.[originalGoalId] ?? null,
      unitKey: item.unit_key,
      label: activeGoal?.title ?? item.unit_key,
      classification: item.classification,
      creditState: item.credit_state,
      activeGoal,
      activeItem: item,
    });
  }

  for (const [key, edit] of Object.entries(draftItemEdits)) {
    const existingEntry = entryByKey.get(key);
    if (!existingEntry) {
      continue;
    }
    const currentDay = entryDayByKey.get(key) ?? null;
    const nextDay = edit.scheduledDate === undefined ? currentDay : edit.scheduledDate;
    const nextGoalTitle =
      edit.label === undefined
        ? existingEntry.goalTitle
        : edit.label ?? existingEntry.goalTitle;

    if (currentDay) {
      byDate.get(currentDay)?.delete(key);
    }
    if (!nextDay) {
      entryByKey.delete(key);
      entryDayByKey.delete(key);
      continue;
    }

    setEntryOnDay(nextDay, key, {
      ...existingEntry,
      goalTitle: nextGoalTitle,
      activeItem: existingEntry.activeItem
        ? {
            ...existingEntry.activeItem,
            scheduled_date: nextDay,
          }
        : null,
    });
  }

  return new Map(
    Array.from(byDate.entries()).map(([day, dayEntries]) => [
      day,
      Array.from(dayEntries.values()),
    ])
  );
}

export function buildEntryByKey(entriesByDate: Map<string, PlannerDayDetailEntry[]>) {
  const map = new Map<string, PlannerDayDetailEntry>();
  for (const entries of entriesByDate.values()) {
    for (const entry of entries) {
      map.set(entry.key, entry);
    }
  }
  return map;
}

export function buildEntryDayByKey(entriesByDate: Map<string, PlannerDayDetailEntry[]>) {
  const map = new Map<string, string>();
  for (const [day, entries] of entriesByDate.entries()) {
    for (const entry of entries) {
      map.set(entry.key, day);
    }
  }
  return map;
}

export function buildPreviewUnitByEntryKey(workUnits: PlannerWorkUnit[] | undefined) {
  const map = new Map<string, PlannerWorkUnit>();
  for (const unit of workUnits ?? []) {
    map.set(
      draftCommandEntryKey({
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
      }),
      unit
    );
  }
  return map;
}

export function buildCompletionFactUnitsByGoalDate(
  workUnits: PlannerWorkUnit[] | undefined
) {
  const map = new Map<string, PlannerWorkUnit[]>();
  for (const unit of workUnits ?? []) {
    if (!unit.creditedCompletionDate) {
      continue;
    }
    const key = `${unit.originalGoalId}:${unit.creditedCompletionDate}`;
    const existing = map.get(key) ?? [];
    existing.push(unit);
    map.set(key, existing);
  }
  return map;
}

export function buildCompletionFactMarkersByDate({
  workUnits,
  currentScopeMonth,
  activeGoalsByOriginalGoalId,
  goalTitles,
}: {
  workUnits: PlannerWorkUnit[] | undefined;
  currentScopeMonth: string | null;
  activeGoalsByOriginalGoalId: Map<string, PlannerActiveGoalSnapshot>;
  goalTitles: Record<string, string> | undefined;
}) {
  const map = new Map<string, PlannerCompletionFactMarker[]>();
  const scopePrefix = currentScopeMonth ? `${currentScopeMonth}-` : null;
  for (const unit of workUnits ?? []) {
    if (!unit.creditedCompletionDate) {
      continue;
    }
    if (unit.creditedCompletionDate === unit.scheduledDate) {
      continue;
    }
    if (scopePrefix && !unit.creditedCompletionDate.startsWith(scopePrefix)) {
      continue;
    }
    const markerDay = unit.creditedCompletionDate;
    const markersForDay = map.get(markerDay) ?? [];
    const goalTitle =
      activeGoalsByOriginalGoalId.get(unit.originalGoalId)?.title ??
      goalTitles?.[unit.originalGoalId] ??
      unit.label ??
      unit.unitKey;
    markersForDay.push({
      key: `${unit.originalGoalId}:${unit.unitKey}:${markerDay}`,
      originalGoalId: unit.originalGoalId,
      unitKey: unit.unitKey,
      goalTitle,
      scheduledDate: unit.scheduledDate,
    });
    map.set(markerDay, markersForDay);
  }
  for (const markersForDay of map.values()) {
    markersForDay.sort((left, right) => left.goalTitle.localeCompare(right.goalTitle));
  }
  return map;
}

export function orderEntriesForDay({
  day,
  entries,
  previewEntryOrderByDay,
}: {
  day: string | null;
  entries: PlannerDayDetailEntry[];
  previewEntryOrderByDay: Record<string, string[]>;
}) {
  if (!day || entries.length === 0) {
    return entries;
  }
  const dayEntryKeys = entries.map((entry) => entry.key);
  const savedOrder = previewEntryOrderByDay[day] ?? [];
  const order = [
    ...savedOrder.filter((entryKey) => dayEntryKeys.includes(entryKey)),
    ...dayEntryKeys.filter((entryKey) => !savedOrder.includes(entryKey)),
  ];
  const orderIndex = new Map(order.map((entryKey, index) => [entryKey, index]));
  const compareWithinGroup = (left: PlannerDayDetailEntry, right: PlannerDayDetailEntry) => {
    const leftOrder = orderIndex.get(left.key);
    const rightOrder = orderIndex.get(right.key);
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== undefined) {
      return -1;
    }
    if (rightOrder !== undefined) {
      return 1;
    }
    return getEntryDisplayTitle(left).localeCompare(getEntryDisplayTitle(right));
  };
  const incomplete = entries
    .filter((entry) => !isEntryCredited(entry))
    .sort(compareWithinGroup);
  const completed = entries
    .filter((entry) => isEntryCredited(entry))
    .sort(compareWithinGroup);
  return [...incomplete, ...completed];
}

export function buildCoachSummaryWorkUnits(
  entriesByDate: Map<string, PlannerDayDetailEntry[]>
) {
  const units: PlannerWorkUnit[] = [];
  for (const [day, entries] of entriesByDate.entries()) {
    for (const entry of entries) {
      units.push({
        originalGoalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        label: entry.label,
        scheduledDate: day,
        classification: entry.classification,
        creditState: entry.creditState,
      });
    }
  }
  return units;
}

