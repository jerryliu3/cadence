import {
  compareDateStrings,
  getAnchoredPeriod,
  getAnchoredPeriodStart,
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

export interface PlannerBaseAssignment {
  goalId: string;
  requirementFingerprint: string;
  unitKey: string;
  scheduledDate: string | null;
  locked: boolean;
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
  classification: WorkUnitClassification;
  missPolicy: "roll_forward" | "remain_missed";
  restEligible: boolean;
  maxPerDay: 1;
  creditedCompletionId: string | null;
  creditedCompletionDate: string | null;
  creditState: WorkUnitCreditState;
  scheduledDate: string | null;
  locked: boolean;
}

export function isEndMonthCadenceUnit(
  scopeMonth: string,
  creditWindow: DateWindow
) {
  return intersectDateWindows(getScopeDateRange(scopeMonth), creditWindow) !== null;
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
    classification,
    missPolicy,
    restEligible,
    maxPerDay: 1,
    creditedCompletionId: null,
    creditedCompletionDate: null,
    creditState: "uncredited",
    scheduledDate: base?.scheduledDate ?? null,
    locked: base?.locked ?? false,
  };
}

export function materializeWorkUnits({
  goal,
  normalizedRequirement,
  scopeMonth,
  asOfDate,
  baseAssignments = [],
}: {
  goal: Goal;
  normalizedRequirement: NormalizedGoalRequirement;
  scopeMonth: string;
  asOfDate: string;
  baseAssignments?: PlannerBaseAssignment[];
}): PlannerWorkUnit[] {
  if (goal.end_date === null) {
    throw new Error("Planner work units require a goal end date.");
  }

  const requirement = normalizedRequirement.requirement;
  const scope = getScopeDateRange(scopeMonth);
  const lifetime = { start: goal.start_date, end: goal.end_date };
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
    const placementWindow = intersectDateWindows(scope, {
      start:
        compareDateStrings(asOfDate, goal.start_date) > 0
          ? asOfDate
          : goal.start_date,
      end: goal.end_date,
    });
    const classification: WorkUnitClassification =
      placementWindow === null &&
      compareDateStrings(asOfDate, goal.end_date) > 0
        ? "historical_shortfall"
        : placementWindow &&
            compareDateStrings(placementWindow.start, asOfDate) > 0
          ? "future"
          : "open";

    return Array.from({ length: requirement.targetCount }, (_, index) => {
      const ordinal = index + 1;
      const milestone = requirement.kind === "milestone_sequence";
      return createUnitBase({
        goal,
        normalizedRequirement,
        unitKey: `${milestone ? "milestone" : "total"}:${ordinal}`,
        kind: requirement.kind,
        ordinal,
        periodKey: null,
        label: milestone ? requirement.labels[index] ?? null : null,
        creditWindow: lifetime,
        placementWindow,
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
    scope.start
  );

  for (
    let index = firstPeriod.index, ordinal = 1;
    ;
    index += 1, ordinal += 1
  ) {
    const periodStart = getAnchoredPeriodStart(
      goal.start_date,
      interval,
      index
    );
    if (
      compareDateStrings(periodStart, scope.end) > 0 ||
      compareDateStrings(periodStart, goal.end_date) > 0
    ) {
      break;
    }
    const period = getAnchoredPeriod(goal.start_date, interval, periodStart);
    const creditWindow = intersectDateWindows(period, lifetime);
    if (!creditWindow || !isEndMonthCadenceUnit(scopeMonth, creditWindow)) {
      continue;
    }

    const placementWindow = intersectDateWindows(creditWindow, scope, {
      start: asOfDate,
      end: goal.end_date,
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
