import { describe, expect, it } from "vitest";
import { allCategoriesValue } from "@/features/goals/goal-filters";
import { buildActiveGoalIndexes } from "@/features/planner/calendar-entries";
import { selectPlannerCalendarStoreProjection } from "@/features/planner/calendar-store-selectors";
import { initialDraftCommandState } from "@/features/planner/draft-command-reducer";
import { selectPlannerDraftSessionModel } from "@/features/planner/planner-draft-session-model";
import {
  selectPlannerCalendarModel,
  type PlannerCalendarModelArgs,
} from "@/features/planner/planner-calendar-model";
import {
  buildPlannerContext,
  buildPlannerWorkUnit,
} from "@/features/planner/test-fixtures";

function buildArgs(
  overrides: Partial<PlannerCalendarModelArgs> = {}
): PlannerCalendarModelArgs {
  const base: PlannerCalendarModelArgs = {
    context: buildPlannerContext(),
    draftPreview: null,
    draftPolicy: null,
    draftCommandState: initialDraftCommandState,
    month: "2026-08",
    selectedDay: "2026-08-06",
    viewMode: "month",
    setupTimezone: "UTC",
    duoScope: "me",
    categoryFilter: allCategoriesValue,
    endMonthFilter: null,
    partnerCompletionMarkersByDate: undefined,
    previewEntryOrderByDay: {},
    additionalProjectionDays: [],
    memoizedState: undefined as unknown as PlannerCalendarModelArgs["memoizedState"],
  };
  const merged = {
    ...base,
    ...overrides,
  };
  const currentScopeMonth = merged.month ?? merged.context?.scopeMonth ?? null;
  const draftSession = selectPlannerDraftSessionModel({
    context: merged.context,
    draftPreview: merged.draftPreview,
    draftPolicy: merged.draftPolicy,
    draftCommandState: merged.draftCommandState,
    currentScopeMonth,
  });
  const activeGoalIndexes = buildActiveGoalIndexes(merged.context?.activePlan?.goals);
  const calendarStoreProjection = selectPlannerCalendarStoreProjection({
    context: merged.context,
    effectivePreview: draftSession.effectivePreview,
    draftCommandState: merged.draftCommandState,
    activeGoalsByPlanGoalId: activeGoalIndexes.byPlanGoalId,
    activeGoalsByOriginalGoalId: activeGoalIndexes.byOriginalGoalId,
  });
  return {
    ...merged,
    memoizedState: {
      draftSession,
      activeGoalIndexes,
      calendarStoreProjection,
    },
  };
}

describe("selectPlannerCalendarModel", () => {
  it("derives canonical view projection and window", () => {
    const args = buildArgs({
      selectedDay: "2026-08-15",
      viewMode: "week",
    });

    const model = selectPlannerCalendarModel(args);

    expect(model.viewProjection.focusedDay).toBe("2026-08-15");
    expect(model.viewProjection.visibleDays).toHaveLength(7);
    expect(model.viewWindow.stepDays).toBe(7);
    expect(model.calendarToday).toBe(args.context?.asOfDate);
  });

  it("projects additional days outside the visible window", () => {
    const offscreenDay = "2026-10-10";
    const context = buildPlannerContext({
      workUnits: [
        buildPlannerWorkUnit({
          originalGoalId: "goal-1",
          unitKey: "unit-offscreen",
          scheduledDate: "2026-10-09",
          creditedCompletionDate: offscreenDay,
        }),
      ],
    });

    const withAdditional = selectPlannerCalendarModel(
      buildArgs({
        context,
        month: "2026-08",
        viewMode: "month",
        additionalProjectionDays: [offscreenDay],
      })
    );

    expect(withAdditional.viewProjection.visibleDays.includes(offscreenDay)).toBe(false);
    expect(withAdditional.dayAccessors.getCompletionFactMarkersForDay(offscreenDay)).toHaveLength(
      1
    );
  });

  it("returns actionable warning model for unplaceable goals", () => {
    const context = buildPlannerContext({
      overrides: {
        unplaceableGoals: [
          {
            goalId: "goal-1",
            requirementFingerprint: "fingerprint",
            policyRevision: 1,
            lockSignature: "lock",
            effectiveSpanEnd: "2026-08-31",
            unplacedCount: 2,
            reason: "invalid_lock",
          },
        ],
      },
    });
    const model = selectPlannerCalendarModel(
      buildArgs({
        context,
      })
    );

    expect(model.warningModel.plannerWarningSeverity).toBe("actionable");
    expect(model.warningModel.warningSuggestedNextSteps).toContain(
      "Unlock conflicting locked sessions and regenerate the calendar."
    );
  });
});
