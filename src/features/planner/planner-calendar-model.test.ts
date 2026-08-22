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

function buildContextWithPersistedPlan(
  workUnits: ReturnType<typeof buildPlannerWorkUnit>[],
  goalTitles: Record<string, string>
) {
  const goalIds = Array.from(new Set(workUnits.map((workUnit) => workUnit.originalGoalId)));
  return buildPlannerContext({
    workUnits,
    overrides: {
      goalTitles,
      activePlan: {
        plan: {
          id: "plan",
          version: 1,
          status: "active",
        },
        goals: goalIds.map((goalId) => ({
          id: goalId,
          goal_id: goalId,
          original_goal_id: goalId,
          requirement_fingerprint: "a".repeat(64),
          title: goalTitles[goalId] ?? goalId,
          category: "Personal",
          color: null,
        })),
        items: workUnits.flatMap((workUnit, index) =>
          workUnit.scheduledDate
            ? [{
                id: `item-${index}`,
                plan_goal_id: workUnit.originalGoalId,
                unit_key: workUnit.unitKey,
                requirement_kind: "deadline_total" as const,
                scheduled_date: workUnit.scheduledDate,
                original_scheduled_date: workUnit.scheduledDate,
                classification: workUnit.classification,
                credit_state: workUnit.creditState,
                locked: false,
                revision: 0,
                credited_completion_id: null,
                credited_completion_date: null,
              }]
            : []
        ),
      },
    },
  });
}

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
    searchQuery: "",
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
    const offscreenDay = "2026-12-10";
    const context = buildPlannerContext({
      workUnits: [
        buildPlannerWorkUnit({
          originalGoalId: "goal-1",
          unitKey: "unit-offscreen",
          scheduledDate: "2026-12-09",
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
            policyFingerprint: "policy-fingerprint",
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

  it("filters day entries by goal title and milestone label search query", () => {
    const context = buildContextWithPersistedPlan(
      [
        buildPlannerWorkUnit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          label: "Strength block",
          scheduledDate: "2026-08-06",
        }),
        buildPlannerWorkUnit({
          originalGoalId: "goal-b",
          unitKey: "milestone:2",
          label: "Tempo run 4x800",
          scheduledDate: "2026-08-06",
        }),
      ],
      {
        "goal-a": "Strength",
        "goal-b": "Half Marathon Build",
      }
    );

    const titleMatches = selectPlannerCalendarModel(
      buildArgs({
        context,
        selectedDay: "2026-08-06",
        searchQuery: "strength",
      })
    ).dayAccessors.getOrderedEntriesForDay("2026-08-06");

    expect(titleMatches).toHaveLength(1);
    expect(titleMatches[0]?.originalGoalId).toBe("goal-a");

    const milestoneMatches = selectPlannerCalendarModel(
      buildArgs({
        context,
        selectedDay: "2026-08-06",
        searchQuery: "4x800",
      })
    ).dayAccessors.getOrderedEntriesForDay("2026-08-06");

    expect(milestoneMatches).toHaveLength(1);
    expect(milestoneMatches[0]?.originalGoalId).toBe("goal-b");
  });

  it("gates entry mutation using an explicit editable date window", () => {
    const context = buildContextWithPersistedPlan(
      [
        buildPlannerWorkUnit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-20",
        }),
      ],
      {
        "goal-a": "Goal A",
      }
    );
    const model = selectPlannerCalendarModel(
      buildArgs({
        context,
        month: "2026-08",
        viewMode: "month",
      })
    );
    const [entry] = model.dayAccessors.getEntriesForDay("2026-08-20");
    expect(entry).toBeDefined();
    if (!entry) {
      throw new Error("Expected an entry on 2026-08-20.");
    }

    expect(model.dayAccessors.canMutateEntryOnDay(entry, "2026-08-25")).toBe(true);
    expect(model.dayAccessors.canMutateEntryOnDay(entry, "2026-09-01")).toBe(false);
  });
});
