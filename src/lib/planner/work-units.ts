import {
  addDaysToDateString,
  compareDateStrings,
  getAnchoredPeriod,
  getAnchoredPeriodStart,
  type WeeklyAnchorContext,
} from "@/lib/goals/periods";
import type { Goal } from "@/lib/goals/types";
import { compareCanonicalStrings } from "@/lib/planner/canonical";
import {
  dateIsInWindow,
  getScopeDateRange,
  intersectDateWindows,
  type DateWindow,
} from "@/lib/planner/dates";
import type { NormalizedGoalRequirement } from "@/lib/planner/requirements";
import { resolvePlannerEffectiveScheduledTime } from "@/lib/planner/schedule-time";

export type WorkUnitClassification =
  | "fulfilled"
  | "open"
  | "future"
  | "historical_shortfall"
  | "historical_miss"
  | "satisfied_elsewhere";

export type WorkUnitCreditState =
  | "uncredited"
  | "completed_as_scheduled"
  | "completed_elsewhere";

const OPEN_ENDED_HORIZON_END = "9999-12-31";

export interface PlannerBaseAssignment {
  goalId: string;
  requirementFingerprint: string;
  unitKey: string;
  scheduledDate: string | null;
  locked: boolean;
  scheduledTimeOverride?: string | null;
}

export interface PlannerWorkUnit {
  originalGoalId: string;
  requirementSchemaVersion: string;
  requirementFingerprint: string;
  unitKey: string;
  kind: "milestone_sequence" | "cadence" | "deadline_total";
  ordinal: number;
  periodKey: string | null;
  label: string | null;
  creditWindow: DateWindow;
  placementWindow: DateWindow | null;
  draftMoveWindow: DateWindow | null;
  classification: WorkUnitClassification;
  missPolicy: "roll_forward" | "remain_missed";
  restEligible: boolean;
  maxPerDay: 1;
  creditedCompletionId: string | null;
  creditedCompletionDate: string | null;
  creditState: WorkUnitCreditState;
  scheduledDate: string | null;
  locked: boolean;
  goalDefaultLocalTime?: string | null;
  scheduledTimeOverride?: string | null;
  effectiveScheduledLocalTime?: string | null;
  effectiveScheduledAtLocal?: string | null;
}

export function isEndMonthCadenceUnit(
  scopeMonth: string,
  period: DateWindow
) {
  return isCadenceUnitInWindow(getScopeDateRange(scopeMonth), period);
}

export function isCadenceUnitInWindow(window: DateWindow, period: DateWindow) {
  const owningMonthRange = getScopeDateRange(owningMonthForPeriod(period));
  return intersectDateWindows(owningMonthRange, window) !== null;
}

export function owningMonthForPeriod(period: DateWindow) {
  const periodStartMonth = period.start.slice(0, 7);
  const daysByMonth = new Map<string, number>();
  let cursor = period.start;
  while (compareDateStrings(cursor, period.end) <= 0) {
    const month = cursor.slice(0, 7);
    daysByMonth.set(month, (daysByMonth.get(month) ?? 0) + 1);
    cursor = addDaysToDateString(cursor, 1);
  }

  let owningMonth = periodStartMonth;
  let maxDays = daysByMonth.get(periodStartMonth) ?? 0;
  for (const [month, days] of daysByMonth) {
    if (days > maxDays) {
      owningMonth = month;
      maxDays = days;
    }
  }

  return owningMonth;
}

function baseAssignmentKey(
  goalId: string,
  requirementFingerprint: string,
  unitKey: string
) {
  return `${goalId}\u0000${requirementFingerprint}\u0000${unitKey}`;
}

function createUnitBase({
  goal,
  normalizedRequirement,
  unitKey,
  kind,
  ordinal,
  periodKey,
  label,
  creditWindow,
  placementWindow,
  draftMoveWindow,
  classification,
  missPolicy,
  restEligible,
  baseAssignments,
}: {
  goal: Goal;
  normalizedRequirement: NormalizedGoalRequirement;
  unitKey: string;
  kind: PlannerWorkUnit["kind"];
  ordinal: number;
  periodKey: string | null;
  label: string | null;
  creditWindow: DateWindow;
  placementWindow: DateWindow | null;
  draftMoveWindow: DateWindow | null;
  classification: WorkUnitClassification;
  missPolicy: PlannerWorkUnit["missPolicy"];
  restEligible: boolean;
  baseAssignments: Map<string, PlannerBaseAssignment>;
}): PlannerWorkUnit {
  const base = baseAssignments.get(
    baseAssignmentKey(
      goal.id,
      normalizedRequirement.requirementFingerprint,
      unitKey
    )
  );
  const resolvedTime = resolvePlannerEffectiveScheduledTime({
    scheduledDate: base?.scheduledDate ?? null,
    goalDefaultLocalTime: goal.default_local_time ?? null,
    scheduledTimeOverride: base?.scheduledTimeOverride ?? null,
  });
  const hasTimeData =
    resolvedTime.goalDefaultLocalTime !== null ||
    resolvedTime.scheduledTimeOverride !== null ||
    resolvedTime.effectiveScheduledLocalTime !== null;
  return {
    originalGoalId: goal.id,
    requirementSchemaVersion: normalizedRequirement.schemaVersion,
    requirementFingerprint:
      normalizedRequirement.requirementFingerprint,
    unitKey,
    kind,
    ordinal,
    periodKey,
    label,
    creditWindow,
    placementWindow,
    draftMoveWindow,
    classification,
    missPolicy,
    restEligible,
    maxPerDay: 1,
    creditedCompletionId: null,
    creditedCompletionDate: null,
    creditState: "uncredited",
    scheduledDate: base?.scheduledDate ?? null,
    locked: base?.locked ?? false,
    ...(hasTimeData
      ? {
          ...(resolvedTime.goalDefaultLocalTime !== null
            ? { goalDefaultLocalTime: resolvedTime.goalDefaultLocalTime }
            : {}),
          scheduledTimeOverride: resolvedTime.scheduledTimeOverride,
          effectiveScheduledLocalTime: resolvedTime.effectiveScheduledLocalTime,
          effectiveScheduledAtLocal: resolvedTime.effectiveScheduledAtLocal,
        }
      : {}),
  };
}

function resolveDraftMoveWindow({
  creditWindow,
  placementWindow,
  asOfDate,
}: {
  creditWindow: DateWindow;
  placementWindow: DateWindow | null;
  asOfDate: string;
}) {
  const start =
    compareDateStrings(creditWindow.start, asOfDate) > 0
      ? creditWindow.start
      : asOfDate;
  if (compareDateStrings(start, creditWindow.end) > 0) {
    return placementWindow;
  }
  return {
    start,
    end: creditWindow.end,
  };
}

export function materializeWorkUnits({
  goal,
  normalizedRequirement,
  window,
  asOfDate,
  baseAssignments = [],
  ordinalsForScopeMonth,
  weeklyAnchor = null,
}: {
  goal: Goal;
  normalizedRequirement: NormalizedGoalRequirement;
  window: DateWindow;
  asOfDate: string;
  baseAssignments?: PlannerBaseAssignment[];
  ordinalsForScopeMonth?: Set<number>;
  weeklyAnchor?: WeeklyAnchorContext | null;
}): PlannerWorkUnit[] {
  const requirement = normalizedRequirement.requirement;
  const planningWindowEnd =
    goal.end_date === null || compareDateStrings(goal.end_date, window.end) > 0
      ? window.end
      : goal.end_date;
  const lifetime = {
    start: goal.start_date,
    end: goal.end_date ?? OPEN_ENDED_HORIZON_END,
  };
  const baseAssignmentMap = new Map(
    baseAssignments.map((assignment) => [
      baseAssignmentKey(
        assignment.goalId,
        assignment.requirementFingerprint,
        assignment.unitKey
      ),
      assignment,
    ])
  );

  if (
    requirement.kind === "milestone_sequence" ||
    requirement.kind === "deadline_total"
  ) {
    if (goal.end_date === null) {
      throw new Error("Planner ordinal work units require a goal end date.");
    }
    if (!ordinalsForScopeMonth) {
      throw new Error(
        "Planner ordinal work units require an explicit ordinal scope allocation."
      );
    }
    const placementWindow = intersectDateWindows(window, {
      start:
        compareDateStrings(asOfDate, goal.start_date) > 0
          ? asOfDate
          : goal.start_date,
      end: goal.end_date ?? OPEN_ENDED_HORIZON_END,
    });
    const classification: WorkUnitClassification =
      placementWindow === null &&
      compareDateStrings(window.end, asOfDate) < 0
        ? "historical_shortfall"
        : placementWindow &&
            compareDateStrings(placementWindow.start, asOfDate) > 0
          ? "future"
          : "open";

    const candidateOrdinals = Array.from(ordinalsForScopeMonth).sort(
      (left, right) => left - right
    );

    return candidateOrdinals
      .map((ordinal) => {
        const milestone = requirement.kind === "milestone_sequence";
        return createUnitBase({
          goal,
          normalizedRequirement,
          unitKey: `${milestone ? "milestone" : "total"}:${ordinal}`,
          kind: requirement.kind,
          ordinal,
          periodKey: null,
          label: milestone ? requirement.labels[ordinal - 1] ?? null : null,
          creditWindow: lifetime,
          placementWindow,
          draftMoveWindow: resolveDraftMoveWindow({
            creditWindow: lifetime,
            placementWindow,
            asOfDate,
          }),
          classification,
          missPolicy: "roll_forward",
          restEligible: true,
          baseAssignments: baseAssignmentMap,
        });
      });
  }

  const units: PlannerWorkUnit[] = [];
  const interval = requirement.interval;
  const firstPeriod = getAnchoredPeriod(
    goal.start_date,
    interval,
    window.start,
    weeklyAnchor
  );

  for (
    let index = firstPeriod.index, ordinal = 1;
    ;
    index += 1, ordinal += 1
  ) {
    const periodStart = getAnchoredPeriodStart(
      goal.start_date,
      interval,
      index,
      weeklyAnchor
    );
    if (compareDateStrings(periodStart, planningWindowEnd) > 0) {
      break;
    }
    const period = getAnchoredPeriod(
      goal.start_date,
      interval,
      periodStart,
      weeklyAnchor
    );
    const creditWindow = intersectDateWindows(period, lifetime);
    if (!creditWindow || !isCadenceUnitInWindow(window, period)) {
      continue;
    }

    const placementWindow = intersectDateWindows(creditWindow, window, {
      start: asOfDate,
      end: goal.end_date ?? OPEN_ENDED_HORIZON_END,
    });
    let classification: WorkUnitClassification = "open";
    if (compareDateStrings(creditWindow.end, asOfDate) < 0) {
      classification = "historical_miss";
    } else if (
      placementWindow &&
      compareDateStrings(placementWindow.start, asOfDate) > 0
    ) {
      classification = "future";
    }

    units.push(
      createUnitBase({
        goal,
        normalizedRequirement,
        unitKey: `cadence:${period.periodKey}`,
        kind: "cadence",
        ordinal,
        periodKey: period.periodKey,
        label: null,
        creditWindow,
        placementWindow,
        draftMoveWindow: resolveDraftMoveWindow({
          creditWindow,
          placementWindow,
          asOfDate,
        }),
        classification,
        missPolicy: "remain_missed",
        restEligible: interval !== "daily",
        baseAssignments: baseAssignmentMap,
      })
    );
  }

  return units.sort((left, right) => {
    if (left.ordinal !== right.ordinal) {
      return left.ordinal - right.ordinal;
    }
    return compareCanonicalStrings(left.unitKey, right.unitKey);
  });
}

export function workUnitCanCreditDate(unit: PlannerWorkUnit, date: string) {
  return dateIsInWindow(date, unit.creditWindow);
}
