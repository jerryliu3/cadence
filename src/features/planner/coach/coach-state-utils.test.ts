import { describe, expect, it } from "vitest";
import {
  buildCoachFocusGoalIds,
  countAssignmentChanges,
} from "@/features/planner/coach/coach-state-utils";
import type { PlannerWorkUnit } from "@/features/planner/calendar-surface.types";
import { MAX_COACH_FOCUS_GOALS } from "@/lib/planner/coach-constants";

function unit(
  goalId: string,
  unitKey: string,
  scheduledDate: string | null
): PlannerWorkUnit {
  return {
    originalGoalId: goalId,
    unitKey,
    label: null,
    scheduledDate,
    classification: "scheduled",
    creditState: "uncredited",
  } as PlannerWorkUnit;
}

describe("buildCoachFocusGoalIds", () => {
  it("orders goals by scheduled activity in the window", () => {
    const ids = buildCoachFocusGoalIds({
      workUnits: [
        unit("goal-a", "milestone:1", "2026-08-05"),
        unit("goal-b", "milestone:1", "2026-08-06"),
        unit("goal-b", "milestone:2", "2026-08-07"),
      ],
      goalTitles: { "goal-a": "Alpha", "goal-b": "Bravo" },
    });

    expect(ids).toEqual(["goal-b", "goal-a"]);
  });

  it("ignores unscheduled units when measuring activity", () => {
    const ids = buildCoachFocusGoalIds({
      workUnits: [
        unit("goal-a", "milestone:1", "2026-08-05"),
        unit("goal-b", "milestone:1", null),
        unit("goal-b", "milestone:2", null),
      ],
      goalTitles: { "goal-a": "Alpha", "goal-b": "Bravo" },
    });

    expect(ids[0]).toBe("goal-a");
  });

  it("appends goals with no scheduled work after the active ones, by title", () => {
    const ids = buildCoachFocusGoalIds({
      workUnits: [unit("goal-c", "milestone:1", "2026-08-05")],
      goalTitles: { "goal-a": "Alpha", "goal-b": "Bravo", "goal-c": "Charlie" },
    });

    expect(ids).toEqual(["goal-c", "goal-a", "goal-b"]);
  });

  it("breaks activity ties by goal title so ordering is deterministic", () => {
    const ids = buildCoachFocusGoalIds({
      workUnits: [
        unit("goal-z", "milestone:1", "2026-08-05"),
        unit("goal-a", "milestone:1", "2026-08-06"),
      ],
      goalTitles: { "goal-z": "Zulu", "goal-a": "Alpha" },
    });

    expect(ids).toEqual(["goal-a", "goal-z"]);
  });

  it("caps the focus set at the shared coach constant", () => {
    const goalTitles: Record<string, string> = {};
    const workUnits: PlannerWorkUnit[] = [];
    for (let index = 0; index < MAX_COACH_FOCUS_GOALS + 10; index += 1) {
      const goalId = `goal-${String(index).padStart(3, "0")}`;
      goalTitles[goalId] = `Goal ${index}`;
      workUnits.push(unit(goalId, "milestone:1", "2026-08-05"));
    }

    expect(
      buildCoachFocusGoalIds({ workUnits, goalTitles })
    ).toHaveLength(MAX_COACH_FOCUS_GOALS);
  });

  it("returns an empty set when there is nothing to focus on", () => {
    expect(buildCoachFocusGoalIds({ workUnits: null, goalTitles: {} })).toEqual([]);
    expect(
      buildCoachFocusGoalIds({ workUnits: undefined, goalTitles: undefined })
    ).toEqual([]);
  });
});

describe("countAssignmentChanges", () => {
  it("counts a moved unit once", () => {
    expect(
      countAssignmentChanges({
        previousWorkUnits: [unit("goal-a", "milestone:1", "2026-08-05")],
        refreshedWorkUnits: [unit("goal-a", "milestone:1", "2026-08-09")],
      })
    ).toBe(1);
  });

  it("counts nothing when every unit keeps its date", () => {
    expect(
      countAssignmentChanges({
        previousWorkUnits: [unit("goal-a", "milestone:1", "2026-08-05")],
        refreshedWorkUnits: [unit("goal-a", "milestone:1", "2026-08-05")],
      })
    ).toBe(0);
  });

  it("counts units that became unplaced and units that gained a date", () => {
    expect(
      countAssignmentChanges({
        previousWorkUnits: [unit("goal-a", "milestone:1", "2026-08-05")],
        refreshedWorkUnits: [unit("goal-a", "milestone:1", null)],
      })
    ).toBe(1);
    expect(
      countAssignmentChanges({
        previousWorkUnits: [unit("goal-a", "milestone:1", null)],
        refreshedWorkUnits: [unit("goal-a", "milestone:1", "2026-08-05")],
      })
    ).toBe(1);
  });

  it("counts appearing and disappearing identities", () => {
    expect(
      countAssignmentChanges({
        previousWorkUnits: [],
        refreshedWorkUnits: [unit("goal-a", "milestone:1", "2026-08-05")],
      })
    ).toBe(1);
    expect(
      countAssignmentChanges({
        previousWorkUnits: [unit("goal-a", "milestone:1", "2026-08-05")],
        refreshedWorkUnits: [],
      })
    ).toBe(1);
  });

  it("treats a missing previous preview as a fully new assignment set", () => {
    expect(
      countAssignmentChanges({
        previousWorkUnits: undefined,
        refreshedWorkUnits: [
          unit("goal-a", "milestone:1", "2026-08-05"),
          unit("goal-a", "milestone:2", "2026-08-12"),
        ],
      })
    ).toBe(2);
  });
});
