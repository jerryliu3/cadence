import { describe, expect, it } from "vitest";
import type {
  PlannerActiveGoalSnapshot,
  PlannerActiveItemSnapshot,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import {
  resolveCompletionControlDisabledReasonForEntry,
  resolveDateFactDispatchForEntry,
  type PlannerEntryDateFactDispatch,
} from "./calendar-completion-selectors";

function buildContext(overrides: Partial<PlannerContextPayload> = {}): PlannerContextPayload {
  return {
    schemaVersion: "1",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-15",
    timezone: "UTC",
    goalTitles: {},
    preferences: null,
    capabilities: { calendarEnabled: true },
    activePlan: null,
    preview: null,
    revisions: {
      canonicalRevision: 1,
      executionRevision: 1,
      scheduleDigest: "digest",
    },
    staleness: { stale: false, reasons: [] },
    ...overrides,
  };
}

function buildActiveGoal(
  overrides: Partial<PlannerActiveGoalSnapshot> = {}
): PlannerActiveGoalSnapshot {
  return {
    id: "plan-goal-1",
    goal_id: "goal-1",
    original_goal_id: "goal-1",
    requirement_fingerprint: "fingerprint",
    title: "Goal 1",
    category: "health",
    color: "#22c55e",
    ...overrides,
  };
}

function buildActiveItem(
  overrides: Partial<PlannerActiveItemSnapshot> = {}
): PlannerActiveItemSnapshot {
  return {
    id: "item-1",
    plan_goal_id: "plan-goal-1",
    unit_key: "cadence:1",
    requirement_kind: "cadence",
    scheduled_date: "2026-08-15",
    classification: "planned",
    credit_state: "uncredited",
    locked: false,
    revision: 1,
    credited_completion_id: null,
    credited_completion_date: null,
    ...overrides,
  };
}

function buildEntry(
  overrides: Partial<PlannerDayDetailEntry> = {}
): PlannerDayDetailEntry {
  return {
    key: "goal-1:cadence:1",
    originalGoalId: "goal-1",
    goalTitle: "Goal 1",
    unitKey: "cadence:1",
    label: "Session",
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

function dispatch(
  decision: PlannerEntryDateFactDispatch["decision"]
): PlannerEntryDateFactDispatch {
  return {
    currentlyCredited: false,
    desiredFactState: "present",
    decision,
  };
}

describe("calendar completion selectors", () => {
  it("returns null date-fact dispatch when context or selected date is missing", () => {
    const entry = buildEntry();
    expect(
      resolveDateFactDispatchForEntry({
        entry,
        context: null,
        selectedDate: "2026-08-15",
      })
    ).toBeNull();
    expect(
      resolveDateFactDispatchForEntry({
        entry,
        context: buildContext(),
        selectedDate: null,
      })
    ).toBeNull();
  });

  it("computes exact-date dispatch for out-of-plan sessions", () => {
    const result = resolveDateFactDispatchForEntry({
      entry: buildEntry({
        activeGoal: null,
        activeItem: null,
        unitKey: "cadence:1",
      }),
      context: buildContext(),
      selectedDate: "2026-08-15",
    });

    expect(result).not.toBeNull();
    expect(result?.currentlyCredited).toBe(false);
    expect(result?.desiredFactState).toBe("present");
    expect(result?.decision.route).toBe("canonical_exact_date");
  });

  it("marks credited entries for removal in dispatch", () => {
    const result = resolveDateFactDispatchForEntry({
      entry: buildEntry({
        creditState: "credited",
        activeItem: buildActiveItem({ credited_completion_id: "completion-1" }),
      }),
      context: buildContext(),
      selectedDate: "2026-08-15",
    });

    expect(result).not.toBeNull();
    expect(result?.currentlyCredited).toBe(true);
    expect(result?.desiredFactState).toBe("absent");
  });

  it("returns disabled reasons by decision path", () => {
    const baseEntry = buildEntry();

    expect(
      resolveCompletionControlDisabledReasonForEntry({
        entry: { ...baseEntry, draftGhost: true },
        dispatch: null,
        canMutatePlanItems: true,
        calendarEnabled: true,
      })
    ).toBe("unsupported");

    expect(
      resolveCompletionControlDisabledReasonForEntry({
        entry: baseEntry,
        dispatch: dispatch({
          route: "item_date",
          exactDateOnly: true,
          allowed: false,
          reason: "future_creation",
        }),
        canMutatePlanItems: true,
        calendarEnabled: true,
      })
    ).toBe("future_creation");

    expect(
      resolveCompletionControlDisabledReasonForEntry({
        entry: baseEntry,
        dispatch: dispatch({
          route: "item_date",
          exactDateOnly: true,
          allowed: false,
          reason: "satisfied_elsewhere",
        }),
        canMutatePlanItems: true,
        calendarEnabled: true,
      })
    ).toBe("satisfied_elsewhere");
  });

  it("enforces route capability checks for allowed decisions", () => {
    const itemEntry = buildEntry({ activeItem: buildActiveItem() });
    const goalEntry = buildEntry({ activeGoal: buildActiveGoal() });

    expect(
      resolveCompletionControlDisabledReasonForEntry({
        entry: buildEntry(),
        dispatch: dispatch({
          route: "canonical_exact_date",
          exactDateOnly: true,
          allowed: true,
          reason: "allowed",
        }),
        canMutatePlanItems: true,
        calendarEnabled: false,
      })
    ).toBe("out_of_scope_route");

    expect(
      resolveCompletionControlDisabledReasonForEntry({
        entry: itemEntry,
        dispatch: dispatch({
          route: "item_date",
          exactDateOnly: true,
          allowed: true,
          reason: "allowed",
        }),
        canMutatePlanItems: true,
        calendarEnabled: true,
      })
    ).toBeNull();

    expect(
      resolveCompletionControlDisabledReasonForEntry({
        entry: itemEntry,
        dispatch: dispatch({
          route: "item_date",
          exactDateOnly: true,
          allowed: true,
          reason: "allowed",
        }),
        canMutatePlanItems: false,
        calendarEnabled: true,
      })
    ).toBe("out_of_scope_route");

    expect(
      resolveCompletionControlDisabledReasonForEntry({
        entry: goalEntry,
        dispatch: dispatch({
          route: "plan_goal_date",
          exactDateOnly: true,
          allowed: true,
          reason: "allowed",
        }),
        canMutatePlanItems: true,
        calendarEnabled: true,
      })
    ).toBeNull();

    expect(
      resolveCompletionControlDisabledReasonForEntry({
        entry: goalEntry,
        dispatch: dispatch({
          route: "legacy_period",
          exactDateOnly: false,
          allowed: true,
          reason: "legacy_period_semantics",
        }),
        canMutatePlanItems: true,
        calendarEnabled: true,
      })
    ).toBe("out_of_scope_route");
  });
});
