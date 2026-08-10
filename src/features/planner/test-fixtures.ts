import type {
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerVisibleMonthContextPayload,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import type { PlannerPolicy } from "@/lib/planner/policy";

export function buildPlannerPolicy(
  overrides: Partial<PlannerPolicy> = {}
): PlannerPolicy {
  return {
    schemaVersion: "1",
    timezone: "UTC",
    timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
    restWeekdays: [],
    blackoutRanges: [],
    ...overrides,
  };
}

export function buildPlannerWorkUnit(
  overrides: Partial<PlannerWorkUnit> = {}
): PlannerWorkUnit {
  return {
    originalGoalId: "goal-1",
    unitKey: "unit-1",
    label: "Easy run",
    scheduledDate: "2026-08-01",
    classification: "planned",
    creditState: "uncredited",
    ...overrides,
  };
}

export function buildPlannerDayEntry(
  overrides: Partial<PlannerDayDetailEntry> = {}
): PlannerDayDetailEntry {
  return {
    key: "goal-1:unit-1",
    originalGoalId: "goal-1",
    goalTitle: "Running",
    unitKey: "unit-1",
    label: "Easy run",
    classification: "planned",
    creditState: "uncredited",
    activeGoal: null,
    activeItem: null,
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
    ...overrides,
  };
}

export function buildPlannerPreview(
  workUnits: PlannerWorkUnit[],
  overrides: Partial<NonNullable<PlannerContextPayload["preview"]>> = {}
): NonNullable<PlannerContextPayload["preview"]> {
  const base: NonNullable<PlannerContextPayload["preview"]> = {
    eligibilityMode: "overlap_v1",
    preserveExistingAssignments: false,
    generationInputHash: "hash",
    solver: {
      placementStatus: "complete",
      searchStatus: "all_units_placed",
      capacityStatus: "unverified",
      issueCodes: [],
      invalidGoalIds: [],
      publishable: true,
      confirmationRequired: false,
    },
    workUnits,
  };
  return {
    ...base,
    ...overrides,
    solver: {
      ...base.solver,
      ...(overrides.solver ?? {}),
    },
    workUnits: overrides.workUnits ?? workUnits,
  };
}

export function buildPlannerContext({
  workUnits = [buildPlannerWorkUnit()],
  overrides = {},
}: {
  workUnits?: PlannerWorkUnit[];
  overrides?: Partial<PlannerContextPayload>;
} = {}): PlannerContextPayload {
  const base: PlannerContextPayload = {
    schemaVersion: "1",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-06",
    timezone: "UTC",
    goalTitles: {
      "goal-1": "Running",
    },
    preferences: {
      timezone: "UTC",
      timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
      policyRevision: 1,
      defaultPolicy: buildPlannerPolicy(),
    },
    capabilities: {
      crossMonthMovesEnabled: false,
    },
    activePlan: null,
    preview: buildPlannerPreview(workUnits),
    revisions: {
      canonicalRevision: 1,
      executionRevision: 1,
    },
    staleness: {
      stale: false,
      reasons: [],
    },
  };

  return {
    ...base,
    ...overrides,
    goalTitles: overrides.goalTitles ?? base.goalTitles,
    capabilities: {
      ...base.capabilities,
      ...(overrides.capabilities ?? {}),
    },
    preferences:
      overrides.preferences === undefined ? base.preferences : overrides.preferences,
    activePlan: overrides.activePlan === undefined ? base.activePlan : overrides.activePlan,
    preview: overrides.preview === undefined ? base.preview : overrides.preview,
    revisions: {
      ...base.revisions,
      ...(overrides.revisions ?? {}),
    },
    staleness: overrides.staleness ?? base.staleness,
  };
}

export function buildPlannerVisibleMonthContext({
  workUnits = [buildPlannerWorkUnit()],
  overrides = {},
}: {
  workUnits?: PlannerWorkUnit[];
  overrides?: Partial<PlannerVisibleMonthContextPayload>;
} = {}): PlannerVisibleMonthContextPayload {
  const base: PlannerVisibleMonthContextPayload = {
    scopeMonth: "2026-09",
    goalTitles: {
      "goal-1": "Running",
    },
    activePlan: null,
    preview: buildPlannerPreview(workUnits, {
      preserveExistingAssignments: true,
      generationInputHash: "visible-hash",
    }),
  };

  return {
    ...base,
    ...overrides,
    goalTitles: overrides.goalTitles ?? base.goalTitles,
    activePlan: overrides.activePlan === undefined ? base.activePlan : overrides.activePlan,
    preview: overrides.preview === undefined ? base.preview : overrides.preview,
  };
}
