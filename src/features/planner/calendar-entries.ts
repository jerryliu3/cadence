import {
  entryDisplayRank,
  getEntryDisplayTitle,
} from "@/features/planner/calendar-format";
import type {
  DraftItemEdit,
  PlannerActiveGoalSnapshot,
  PlannerActiveItemSnapshot,
  PlannerCompletionFactMarker,
  PlannerDayDetailEntry,
  PlannerVisibleMonthContextPayload,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import { diffPlannerAssignmentsForDraftVisual } from "@/lib/planner/diff";
import { draftCommandEntryKey } from "@/lib/planner/draft-commands";
import { resolvePlannerEffectiveScheduledTime } from "@/lib/planner/schedule-time";

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
  baselineWorkUnits,
  workUnits,
  activeItems,
  activeGoalsByPlanGoalId,
  activeGoalsByOriginalGoalId,
  goalTitles,
  draftItemEdits,
}: {
  baselineWorkUnits?: PlannerWorkUnit[];
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
  const unitByEntryKey = new Map<string, PlannerWorkUnit>();
  const activeItemByEntryKey = new Map<string, PlannerActiveItemSnapshot>();

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

  const buildEntryFromUnit = ({
    key,
    day,
    unit,
    activeItem,
    overrideGoalTitle,
  }: {
    key: string;
    day: string;
    unit: PlannerWorkUnit;
    activeItem: PlannerActiveItemSnapshot | null;
    overrideGoalTitle?: string | null;
  }): PlannerDayDetailEntry => {
    const activeGoal = activeGoalsByOriginalGoalId.get(unit.originalGoalId) ?? null;
    const resolvedTime = resolvePlannerEffectiveScheduledTime({
      scheduledDate: day,
      goalDefaultLocalTime: unit.goalDefaultLocalTime ?? null,
      scheduledTimeOverride:
        unit.scheduledTimeOverride ??
        activeItem?.scheduled_time_override ??
        null,
    });
    return {
      key,
      originalGoalId: unit.originalGoalId,
      goalTitle:
        overrideGoalTitle ??
        activeGoal?.title ??
        goalTitles?.[unit.originalGoalId] ??
        unit.label ??
        unit.unitKey,
      unitKey: unit.unitKey,
      label: unit.label,
      classification: unit.classification,
      creditState: unit.creditState,
      activeGoal,
      activeItem:
        activeItem === null
          ? null
          : {
              ...activeItem,
              scheduled_date: day,
            },
      draftDiffKind: null,
      draftDiffFromDate: null,
      draftDiffToDate: null,
      draftGhost: false,
      goalDefaultLocalTime: resolvedTime.goalDefaultLocalTime,
      scheduledTimeOverride: resolvedTime.scheduledTimeOverride,
      effectiveScheduledLocalTime: resolvedTime.effectiveScheduledLocalTime,
    };
  };

  for (const unit of workUnits ?? []) {
    const key = `${unit.originalGoalId}:${unit.unitKey}`;
    unitByEntryKey.set(key, unit);
    if (!unit.scheduledDate) {
      continue;
    }
    setEntryOnDay(unit.scheduledDate, key, {
      ...buildEntryFromUnit({
        key,
        day: unit.scheduledDate,
        unit,
        activeItem: null,
      }),
    });
  }

  for (const item of activeItems ?? []) {
    const activeGoal = activeGoalsByPlanGoalId.get(item.plan_goal_id) ?? null;
    const originalGoalId = activeGoal?.original_goal_id ?? item.plan_goal_id;
    const key = `${originalGoalId}:${item.unit_key}`;
    activeItemByEntryKey.set(key, item);
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
        goalDefaultLocalTime:
          existingEntry.goalDefaultLocalTime ??
          unitByEntryKey.get(key)?.goalDefaultLocalTime ??
          null,
        scheduledTimeOverride:
          existingEntry.scheduledTimeOverride ??
          item.scheduled_time_override ??
          null,
        effectiveScheduledLocalTime:
          existingEntry.effectiveScheduledLocalTime ??
          item.effective_scheduled_local_time ??
          null,
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
      draftDiffKind: null,
      draftDiffFromDate: null,
      draftDiffToDate: null,
      draftGhost: false,
      goalDefaultLocalTime: null,
      scheduledTimeOverride: item.scheduled_time_override ?? null,
      effectiveScheduledLocalTime: item.effective_scheduled_local_time ?? null,
    });
  }

  for (const [key, edit] of Object.entries(draftItemEdits)) {
    const existingEntry = entryByKey.get(key) ?? null;
    const currentDay = existingEntry ? (entryDayByKey.get(key) ?? null) : null;
    const unit = unitByEntryKey.get(key) ?? null;
    const nextDay = edit.scheduledDate === undefined ? currentDay : edit.scheduledDate;
    const nextGoalTitle =
      edit.label === undefined
        ? existingEntry?.goalTitle ??
          (unit
            ? activeGoalsByOriginalGoalId.get(unit.originalGoalId)?.title ??
              goalTitles?.[unit.originalGoalId] ??
              unit.label ??
              unit.unitKey
            : null)
        : edit.label ??
          existingEntry?.goalTitle ??
          (unit ? goalTitles?.[unit.originalGoalId] ?? unit.label ?? unit.unitKey : null);
    const nextScheduledTimeOverride =
      edit.scheduledTimeOverride === undefined
        ? existingEntry?.scheduledTimeOverride ?? unit?.scheduledTimeOverride ?? null
        : edit.scheduledTimeOverride;
    const resolvedDraftTime = resolvePlannerEffectiveScheduledTime({
      scheduledDate: nextDay,
      goalDefaultLocalTime:
        existingEntry?.goalDefaultLocalTime ??
        unit?.goalDefaultLocalTime ??
        null,
      scheduledTimeOverride: nextScheduledTimeOverride,
    });

    if (existingEntry && currentDay) {
      byDate.get(currentDay)?.delete(key);
    }
    if (!nextDay) {
      if (existingEntry) {
        entryByKey.delete(key);
        entryDayByKey.delete(key);
      }
      continue;
    }

    if (!existingEntry) {
      if (!unit) {
        continue;
      }
      setEntryOnDay(
        nextDay,
        key,
        buildEntryFromUnit({
          key,
          day: nextDay,
          unit,
          activeItem: activeItemByEntryKey.get(key) ?? null,
          overrideGoalTitle: nextGoalTitle,
        })
      );
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
      goalDefaultLocalTime: resolvedDraftTime.goalDefaultLocalTime,
      scheduledTimeOverride: resolvedDraftTime.scheduledTimeOverride,
      effectiveScheduledLocalTime: resolvedDraftTime.effectiveScheduledLocalTime,
    });
  }

  const baseAssignments = (baselineWorkUnits ?? workUnits ?? []).map((unit) => ({
    goalId: unit.originalGoalId,
    unitKey: unit.unitKey,
    scheduledDate: unit.scheduledDate,
  }));
  const nextAssignments = (workUnits ?? []).map((unit) => {
    const entryKey = `${unit.originalGoalId}:${unit.unitKey}`;
    const draftEdit = draftItemEdits[entryKey];
    return {
      goalId: unit.originalGoalId,
      unitKey: unit.unitKey,
      scheduledDate:
        draftEdit?.scheduledDate === undefined
          ? unit.scheduledDate
          : draftEdit.scheduledDate ?? null,
    };
  });
  const draftDiff = diffPlannerAssignmentsForDraftVisual({
    baseAssignments,
    nextAssignments,
  });

  for (const diffEntry of draftDiff) {
    const entryKey = `${diffEntry.goalId}:${diffEntry.unitKey}`;
    const dayEntries = byDate.get(diffEntry.date) ?? new Map<string, PlannerDayDetailEntry>();
    let targetKey = entryKey;
    if (!dayEntries.has(targetKey) && diffEntry.kind === "moved_from") {
      targetKey = `${entryKey}:ghost:${diffEntry.date}`;
    }
    const existingEntry = dayEntries.get(targetKey);
    if (existingEntry) {
      dayEntries.set(targetKey, {
        ...existingEntry,
        draftDiffKind: diffEntry.kind,
        draftDiffFromDate:
          diffEntry.kind === "moved_to" ? diffEntry.counterpartDate : diffEntry.date,
        draftDiffToDate:
          diffEntry.kind === "moved_from" ? diffEntry.counterpartDate : diffEntry.date,
      });
      byDate.set(diffEntry.date, dayEntries);
      continue;
    }
    if (diffEntry.kind !== "moved_from") {
      byDate.set(diffEntry.date, dayEntries);
      continue;
    }

    const unit = unitByEntryKey.get(entryKey);
    const activeGoal = activeGoalsByOriginalGoalId.get(diffEntry.goalId) ?? null;
    dayEntries.set(targetKey, {
      key: targetKey,
      originalGoalId: diffEntry.goalId,
      goalTitle:
        activeGoal?.title ??
        goalTitles?.[diffEntry.goalId] ??
        unit?.label ??
        diffEntry.unitKey,
      unitKey: diffEntry.unitKey,
      label: unit?.label ?? null,
      classification: unit?.classification ?? "open",
      creditState: unit?.creditState ?? "uncredited",
      activeGoal,
      activeItem: null,
      draftDiffKind: "moved_from",
      draftDiffFromDate: diffEntry.date,
      draftDiffToDate: diffEntry.counterpartDate,
      draftGhost: true,
      scheduledTimeOverride: unit?.scheduledTimeOverride ?? null,
      effectiveScheduledLocalTime: unit?.effectiveScheduledLocalTime ?? null,
    });
    byDate.set(diffEntry.date, dayEntries);
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

function completionFactIdentityKey(marker: {
  originalGoalId: string;
  unitKey: string;
}) {
  return `${marker.originalGoalId}:${marker.unitKey}`;
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

export function buildCompletionFactMarkerDayByIdentity(
  completionFactMarkersByDate: Map<string, PlannerCompletionFactMarker[]>
) {
  const map = new Map<string, string>();
  for (const [day, markers] of completionFactMarkersByDate.entries()) {
    for (const marker of markers) {
      map.set(completionFactIdentityKey(marker), day);
    }
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
  activeGoalsByOriginalGoalId,
  goalTitles,
}: {
  workUnits: PlannerWorkUnit[] | undefined;
  activeGoalsByOriginalGoalId: Map<string, PlannerActiveGoalSnapshot>;
  goalTitles: Record<string, string> | undefined;
}) {
  const map = new Map<string, PlannerCompletionFactMarker[]>();
  for (const unit of workUnits ?? []) {
    if (!unit.creditedCompletionDate) {
      continue;
    }
    if (unit.creditedCompletionDate === unit.scheduledDate) {
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

export function buildVisibleMonthCalendarDataByMonth(
  contextsByMonth: Record<string, PlannerVisibleMonthContextPayload>
) {
  const monthDataByMonth = new Map<
    string,
    {
      entriesByDate: Map<string, PlannerDayDetailEntry[]>;
      completionFactMarkersByDate: Map<string, PlannerCompletionFactMarker[]>;
    }
  >();
  for (const [visibleMonth, visibleMonthContext] of Object.entries(contextsByMonth)) {
    const visibleMonthGoalIndexes = buildActiveGoalIndexes(
      visibleMonthContext.activePlan?.goals
    );
    const entriesByDate = buildEntriesByDate({
      baselineWorkUnits: visibleMonthContext.preview?.workUnits,
      workUnits: visibleMonthContext.preview?.workUnits,
      activeItems: visibleMonthContext.activePlan?.items,
      activeGoalsByPlanGoalId: visibleMonthGoalIndexes.byPlanGoalId,
      activeGoalsByOriginalGoalId: visibleMonthGoalIndexes.byOriginalGoalId,
      goalTitles: visibleMonthContext.goalTitles,
      draftItemEdits: {},
    });
    const completionFactMarkersByDate = buildCompletionFactMarkersByDate({
      workUnits: visibleMonthContext.preview?.workUnits,
      activeGoalsByOriginalGoalId: visibleMonthGoalIndexes.byOriginalGoalId,
      goalTitles: visibleMonthContext.goalTitles,
    });
    monthDataByMonth.set(visibleMonth, {
      entriesByDate,
      completionFactMarkersByDate,
    });
  }
  return monthDataByMonth;
}

export function resolveCalendarDayData({
  day,
  entriesByDate,
  entryDayByKey,
  previewUnitByEntryKey,
  completionFactMarkersByDate,
  completionFactMarkerDayByIdentity,
  visibleMonthCalendarDataByMonth,
}: {
  day: string | null;
  entriesByDate: Map<string, PlannerDayDetailEntry[]>;
  entryDayByKey?: Map<string, string>;
  previewUnitByEntryKey?: Map<string, PlannerWorkUnit>;
  completionFactMarkersByDate: Map<string, PlannerCompletionFactMarker[]>;
  completionFactMarkerDayByIdentity?: Map<string, string>;
  visibleMonthCalendarDataByMonth: Map<
    string,
    {
      entriesByDate: Map<string, PlannerDayDetailEntry[]>;
      completionFactMarkersByDate: Map<string, PlannerCompletionFactMarker[]>;
    }
  >;
}) {
  if (!day) {
    return {
      entries: [] as PlannerDayDetailEntry[],
      completionFactMarkers: [] as PlannerCompletionFactMarker[],
    };
  }
  const currentEntries = entriesByDate.get(day) ?? [];
  const currentCompletionFactMarkers = completionFactMarkersByDate.get(day) ?? [];
  const canonicalEntryDayByKey = entryDayByKey ?? buildEntryDayByKey(entriesByDate);
  const hasCanonicalEntry =
    previewUnitByEntryKey !== undefined
      ? (entryKey: string) => previewUnitByEntryKey.has(entryKey)
      : (entryKey: string) => canonicalEntryDayByKey.has(entryKey);
  const canonicalCompletionFactMarkerDayByIdentity =
    completionFactMarkerDayByIdentity ??
    buildCompletionFactMarkerDayByIdentity(completionFactMarkersByDate);
  const visibleMonthData = visibleMonthCalendarDataByMonth.get(day.slice(0, 7));
  const supplementalEntries = visibleMonthData?.entriesByDate.get(day) ?? [];
  const supplementalCompletionFactMarkers =
    visibleMonthData?.completionFactMarkersByDate.get(day) ?? [];
  const mergedEntriesByKey = new Map(
    currentEntries.map((entry) => [entry.key, entry])
  );
  for (const entry of supplementalEntries) {
    const canonicalDay = canonicalEntryDayByKey.get(entry.key) ?? null;
    if (hasCanonicalEntry(entry.key) && canonicalDay !== day) {
      continue;
    }
    if (!mergedEntriesByKey.has(entry.key)) {
      mergedEntriesByKey.set(entry.key, entry);
    }
  }
  const mergedCompletionFactMarkersByKey = new Map(
    currentCompletionFactMarkers.map((marker) => [marker.key, marker])
  );
  for (const marker of supplementalCompletionFactMarkers) {
    const markerIdentityKey = completionFactIdentityKey(marker);
    const canonicalMarkerDay =
      canonicalCompletionFactMarkerDayByIdentity.get(markerIdentityKey) ?? null;
    if (hasCanonicalEntry(markerIdentityKey) && canonicalMarkerDay !== day) {
      continue;
    }
    if (!mergedCompletionFactMarkersByKey.has(marker.key)) {
      mergedCompletionFactMarkersByKey.set(marker.key, marker);
    }
  }
  return {
    entries: Array.from(mergedEntriesByKey.values()),
    completionFactMarkers: Array.from(mergedCompletionFactMarkersByKey.values()),
  };
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
  const savedOrderSet = new Set(savedOrder);
  const orderIndex = new Map(order.map((entryKey, index) => [entryKey, index]));
  const compareWithinGroup = (left: PlannerDayDetailEntry, right: PlannerDayDetailEntry) => {
    const byRank = entryDisplayRank(left) - entryDisplayRank(right);
    if (byRank !== 0) {
      return byRank;
    }
    const leftPinned = savedOrderSet.has(left.key);
    const rightPinned = savedOrderSet.has(right.key);
    if (!leftPinned && !rightPinned) {
      const leftTime = left.effectiveScheduledLocalTime ?? null;
      const rightTime = right.effectiveScheduledLocalTime ?? null;
      if (leftTime && rightTime && leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }
      if (leftTime && !rightTime) {
        return -1;
      }
      if (!leftTime && rightTime) {
        return 1;
      }
    }
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
  return [...entries].sort(compareWithinGroup);
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

