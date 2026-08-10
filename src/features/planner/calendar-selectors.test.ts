import { describe, expect, it } from "vitest";
import type { PlannerContextPayload } from "@/features/planner/calendar-surface.types";
import {
  selectPlannerCalendarHeaderModel,
  selectPlannerCalendarSaveStateModel,
  selectPlannerCalendarViewModel,
} from "./calendar-selectors";

function buildPreview(
  overrides: Partial<NonNullable<PlannerContextPayload["preview"]>> = {}
): NonNullable<PlannerContextPayload["preview"]> {
  return {
    eligibilityMode: "overlap_v1",
    preserveExistingAssignments: true,
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
    workUnits: [],
    eligibility: [],
    horizonSummary: [],
    ...overrides,
  };
}

function buildContext(
  overrides: Partial<PlannerContextPayload> = {}
): PlannerContextPayload {
  return {
    schemaVersion: "1",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-10",
    timezone: "UTC",
    goalTitles: {},
    preferences: null,
    capabilities: {
      calendarEnabled: true,
    },
    activePlan: {
      plan: {
        id: "plan-1",
        version: 1,
        status: "active",
      },
      goals: [],
      items: [],
    },
    preview: buildPreview(),
    revisions: {
      canonicalRevision: 1,
      executionRevision: 1,
      scheduleDigest: null,
    },
    staleness: {
      stale: false,
      reasons: [],
    },
    ...overrides,
  };
}

describe("calendar selectors", () => {
  it("builds header eligibility and horizon summary model", () => {
    const preview = buildPreview({
      horizonSummary: [
        {
          goalId: "goal-b",
          kind: "milestone_sequence",
          totalCount: 2,
          creditedCount: 1,
          remainingCount: 1,
          scopeMonthPlannedCount: 1,
          months: [],
        },
      ],
      eligibility: [
        {
          goalId: "goal-b",
          eligible: false,
          reason: "missing_end_date",
        },
        {
          goalId: "goal-c",
          eligible: false,
          reason: "starts_after_scope",
        },
      ],
    });

    const model = selectPlannerCalendarHeaderModel({
      preview,
      goalTitles: {
        "goal-b": "Finish training block",
      },
    });

    expect(model.horizonCounter).toEqual({
      thisMonth: 1,
      total: 2,
      remaining: 1,
    });
    expect(model.eligibilityNotices.scopeOnlyCount).toBe(1);
    expect(model.eligibilityNotices.hardIneligible).toEqual([
      {
        goalId: "goal-b",
        goalTitle: "Finish training block",
        reasonCopy: "This goal needs a deadline before it can be planned in Calendar.",
      },
    ]);
  });

  it("builds view heading copy and navigation affordances", () => {
    const model = selectPlannerCalendarViewModel({
      month: "2026-08",
      viewMode: "week",
      focusedDay: "2026-08-14",
      focusedWeekDays: [
        "2026-08-10",
        "2026-08-11",
        "2026-08-12",
        "2026-08-13",
        "2026-08-14",
        "2026-08-15",
        "2026-08-16",
      ],
      calendarToday: "2026-08-10",
      weekStartsOn: 1,
      timezone: "UTC",
    });

    expect(model.viewHeading).toBe("Aug 10 - Aug 16, 2026");
    expect(model.viewDescription).toBe(
      "Expanded 7-day planner view with drag-and-drop editing."
    );
    expect(model.previousWindowAriaLabel).toBe("Previous week");
    expect(model.nextWindowAriaLabel).toBe("Next week");
    expect(model.canResetViewWindow).toBe(true);
  });

  it("builds save-state model for blocked and lock-reset scenarios", () => {
    const preview = buildPreview({
      solver: {
        placementStatus: "complete",
        searchStatus: "all_units_placed",
        capacityStatus: "unverified",
        issueCodes: [],
        invalidGoalIds: [],
        publishable: false,
        confirmationRequired: false,
      },
    });
    const blockedModel = selectPlannerCalendarSaveStateModel({
      context: buildContext({
        scopeMonth: "2026-07",
        asOfDate: "2026-08-10",
        preview,
      }),
      effectivePreview: preview,
      hasDraftSession: true,
      saveLoading: false,
      dirtyScopeMonths: ["2026-07"],
      draftPreviewByScope: {},
      visibleMonthContexts: {},
    });

    expect(blockedModel.draftSaveBlocked).toBe(true);
    // The elapsed-month rule wins over the unpublishable-solver rule, and the
    // message is prefixed with the scope month that is actually blocking.
    expect(blockedModel.draftSaveBlockedMessage).toBe(
      "2026-07: Publishing an elapsed month is not supported. Publish the current or a future month."
    );
    expect(blockedModel.canResetPlan).toBe(false);
    expect(blockedModel.saveButtonLabel).toBe("Save plan");

    const resetModel = selectPlannerCalendarSaveStateModel({
      context: buildContext({
        activePlan: {
          plan: {
            id: "plan-1",
            version: 1,
            status: "active",
          },
          goals: [],
          items: [
            {
              id: "item-1",
              plan_goal_id: "plan-goal-1",
              unit_key: "unit-1",
              requirement_kind: "cadence",
              scheduled_date: "2026-08-11",
              classification: "planned",
              credit_state: "uncredited",
              locked: true,
              revision: 1,
              credited_completion_id: null,
              credited_completion_date: null,
            },
          ],
        },
      }),
      effectivePreview: preview,
      hasDraftSession: false,
      saveLoading: true,
      dirtyScopeMonths: [],
      draftPreviewByScope: {},
      visibleMonthContexts: {},
    });

    expect(resetModel.canResetPlan).toBe(true);
    expect(resetModel.saveButtonLabel).toBe("Saving...");
    expect(resetModel.readOnlyMonthHint).toContain("another month snapshot");
  });

  it("blocks save on a dirty sibling month resolved from its own preview", () => {
    const publishablePreview = buildPreview({
      solver: {
        placementStatus: "complete",
        searchStatus: "all_units_placed",
        capacityStatus: "unverified",
        issueCodes: [],
        invalidGoalIds: [],
        publishable: true,
        confirmationRequired: false,
      },
    });
    const siblingPreview = buildPreview({
      solver: {
        placementStatus: "complete",
        searchStatus: "all_units_placed",
        capacityStatus: "unverified",
        issueCodes: ["capacity_shortfall"],
        invalidGoalIds: [],
        publishable: false,
        confirmationRequired: false,
      },
    });
    const context = buildContext({
      scopeMonth: "2026-08",
      asOfDate: "2026-08-10",
      preview: publishablePreview,
    });

    // The viewed month is fine; only the sibling month the draft also dirtied
    // is unpublishable, and its preview lives in the draft preview cache.
    const model = selectPlannerCalendarSaveStateModel({
      context,
      effectivePreview: publishablePreview,
      hasDraftSession: true,
      saveLoading: false,
      dirtyScopeMonths: ["2026-08", "2026-09"],
      draftPreviewByScope: { "2026-09": siblingPreview },
      visibleMonthContexts: {},
    });

    expect(model.scopeMonthsForSaveAction).toEqual(["2026-08", "2026-09"]);
    expect(model.draftSaveBlocked).toBe(true);
    expect(model.draftSaveBlockedMessage).toBe(
      "2026-09: Resolve planner issues before saving: capacity_shortfall."
    );
  });

  it("falls back to the visible-month preview and stays unblocked when every scope is publishable", () => {
    const publishablePreview = buildPreview({
      solver: {
        placementStatus: "complete",
        searchStatus: "all_units_placed",
        capacityStatus: "unverified",
        issueCodes: [],
        invalidGoalIds: [],
        publishable: true,
        confirmationRequired: false,
      },
    });
    const context = buildContext({
      scopeMonth: "2026-08",
      asOfDate: "2026-08-10",
      preview: publishablePreview,
    });

    const model = selectPlannerCalendarSaveStateModel({
      context,
      effectivePreview: publishablePreview,
      hasDraftSession: true,
      saveLoading: false,
      dirtyScopeMonths: ["2026-08", "2026-09"],
      draftPreviewByScope: {},
      visibleMonthContexts: { "2026-09": { preview: publishablePreview } },
    });

    expect(model.draftSaveBlocked).toBe(false);
    expect(model.draftSaveBlockedMessage).toBeNull();
    expect(model.canShowSaveAction).toBe(true);
  });
});
