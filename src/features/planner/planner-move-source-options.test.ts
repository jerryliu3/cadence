import { describe, expect, it } from "vitest";
import { buildActiveGoalIndexes } from "@/features/planner/calendar-entries";
import { selectPlannerCalendarStoreProjection } from "@/features/planner/calendar-store-selectors";
import { initialDraftCommandState } from "@/features/planner/draft-command-reducer";
import { buildMoveSourceOptions } from "@/features/planner/planner-move-source-options";
import {
  buildPlannerContext,
  buildPlannerWorkUnit,
} from "@/features/planner/test-fixtures";
import { draftCommandEntryKey } from "@/lib/planner/draft-commands";

describe("buildMoveSourceOptions", () => {
  it("excludes source entries whose goal is already scheduled on the target day", () => {
    const targetDay = "2026-08-31";
    const context = buildPlannerContext({
      workUnits: [
        buildPlannerWorkUnit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          label: "Goal A target",
          scheduledDate: targetDay,
        }),
        buildPlannerWorkUnit({
          originalGoalId: "goal-a",
          unitKey: "total:2",
          label: "Goal A source",
          scheduledDate: "2026-08-30",
        }),
        buildPlannerWorkUnit({
          originalGoalId: "goal-b",
          unitKey: "total:1",
          label: "Goal B source",
          scheduledDate: "2026-08-30",
        }),
      ],
    });
    const activeGoalIndexes = buildActiveGoalIndexes(context.activePlan?.goals);
    const projection = selectPlannerCalendarStoreProjection({
      context,
      effectivePreview: context.preview,
      draftCommandState: initialDraftCommandState,
      activeGoalsByPlanGoalId: activeGoalIndexes.byPlanGoalId,
      activeGoalsByOriginalGoalId: activeGoalIndexes.byOriginalGoalId,
    });
    const draftWindowUnitByEntryKey = new Map(
      (context.preview?.workUnits ?? []).map((unit) => [
        draftCommandEntryKey({
          goalId: unit.originalGoalId,
          unitKey: unit.unitKey,
        }),
        unit,
      ])
    );

    const options = buildMoveSourceOptions({
      targetDay,
      scopeMonth: "2026-08",
      moveDialogEntriesForTargetDay: projection.entriesByDate.get(targetDay) ?? [],
      entriesByDate: projection.entriesByDate,
      draftWindowUnitByEntryKey,
      canMutateEntryOnDay: () => true,
      getEntryDisplayTitleWithTime: (entry) => entry.label ?? "",
    });

    expect(options.some((option) => option.entry.originalGoalId === "goal-a")).toBe(
      false
    );
  });
});
