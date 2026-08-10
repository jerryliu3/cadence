import { describe, expect, it, vi } from "vitest";
import type { PlannerEntryDateFactDispatch } from "@/features/planner/calendar-completion-selectors";
import type {
  CompletionControlDisabledReason,
  PlannerCompletionFactMarker,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { PlannerCalendarDayProjection } from "@/features/planner/calendar-store-selectors";
import {
  selectPlannerCalendarDayCellRenderModel,
  selectPlannerEntryCompletionToggleViewModel,
} from "./calendar-view-model-selectors";

function buildEntry(
  overrides: Partial<PlannerDayDetailEntry> = {}
): PlannerDayDetailEntry {
  return {
    key: "goal-a:unit-1",
    originalGoalId: "goal-a",
    goalTitle: "Goal A",
    unitKey: "unit-1",
    label: "Goal A",
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

function buildDayProjection({
  entries,
  completionFactMarkers,
}: {
  entries: PlannerDayDetailEntry[];
  completionFactMarkers: PlannerCompletionFactMarker[];
}): PlannerCalendarDayProjection {
  return {
    entries,
    completionFactMarkers,
    orderedEntries: entries,
  };
}

describe("calendar view model selectors", () => {
  it("builds day cell view model with status and aria label", () => {
    const day = "2026-08-19";
    const model = selectPlannerCalendarDayCellRenderModel({
      cell: {
        date: day,
        inMonth: true,
      },
      dayProjection: buildDayProjection({
        entries: [buildEntry()],
        completionFactMarkers: [],
      }),
      calendarToday: "2026-08-20",
    });

    expect(model.day).toBe(day);
    expect(model.isToday).toBe(false);
    expect(model.isPastInMonth).toBe(true);
    expect(model.entriesForDay).toHaveLength(1);
    expect(model.completionFactMarkersForDay).toHaveLength(0);
    expect(model.ariaLabel).toContain("Wednesday, August 19, 2026.");
    expect(model.ariaLabel).toContain("1 planned item.");
    expect(model.ariaLabel).toContain("0 completion facts.");
    expect(model.ariaLabel).toContain("Planned.");
  });

  it("marks completion-only days as completed elsewhere in aria copy", () => {
    const marker: PlannerCompletionFactMarker = {
      key: "marker-1",
      originalGoalId: "goal-a",
      unitKey: "unit-1",
      goalTitle: "Goal A",
      scheduledDate: "2026-08-22",
    };
    const model = selectPlannerCalendarDayCellRenderModel({
      cell: {
        date: "2026-08-23",
        inMonth: true,
      },
      dayProjection: buildDayProjection({
        entries: [],
        completionFactMarkers: [marker],
      }),
      calendarToday: "2026-08-23",
    });

    expect(model.isToday).toBe(true);
    expect(model.ariaLabel).toContain("0 planned items.");
    expect(model.ariaLabel).toContain("1 completion fact.");
    expect(model.ariaLabel).toContain("Completed elsewhere.");
  });

  it("returns read-only completion toggle state for out-of-scope entries", () => {
    const entry = buildEntry({
      creditState: "credited",
    });
    const toggleState = selectPlannerEntryCompletionToggleViewModel({
      entry,
      day: "2026-08-10",
      canMutateEntryOnDay: () => false,
      isEntryCredited: (candidate) => candidate.creditState !== "uncredited",
      readOnlyMonthHint: "Open this month to edit.",
      getDateFactDispatchForEntry: vi.fn(),
      completionControlDisabledReasonForEntry: vi.fn(),
    });

    expect(toggleState).toEqual({
      currentlyCredited: true,
      disabledReasonCopy: "Open this month to edit.",
    });
  });

  it("maps completion disabled reason copy for mutable entries", () => {
    const entry = buildEntry();
    const dispatch: PlannerEntryDateFactDispatch = {
      currentlyCredited: false,
      desiredFactState: "present",
      decision: {
        allowed: true,
        reason: "allowed",
        route: "item_date",
        exactDateOnly: true,
      },
    };
    const toggleState = selectPlannerEntryCompletionToggleViewModel({
      entry,
      day: "2026-08-10",
      canMutateEntryOnDay: () => true,
      isEntryCredited: () => false,
      readOnlyMonthHint: "unused",
      getDateFactDispatchForEntry: vi.fn(() => dispatch),
      completionControlDisabledReasonForEntry: vi.fn<
        (
          entry: PlannerDayDetailEntry,
          dispatch: PlannerEntryDateFactDispatch | null
        ) => CompletionControlDisabledReason | null
      >(() => "future_creation"),
    });

    expect(toggleState).toEqual({
      currentlyCredited: false,
      disabledReasonCopy:
        "You can only mark planner sessions done for today or past dates.",
    });
  });
});
