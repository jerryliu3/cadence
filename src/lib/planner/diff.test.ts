import { describe, expect, it } from "vitest";
import {
  diffPlannerAssignmentsForDraftVisual,
  type PlannerDraftVisualAssignment,
} from "@/lib/planner/diff";

function assignment(
  goalId: string,
  unitKey: string,
  scheduledDate: string | null
): PlannerDraftVisualAssignment {
  return { goalId, unitKey, scheduledDate };
}

describe("planner draft visual diff", () => {
  it("emits moved-from and moved-to entries for date changes", () => {
    const diff = diffPlannerAssignmentsForDraftVisual({
      baseAssignments: [assignment("goal-a", "total:1", "2026-08-05")],
      nextAssignments: [assignment("goal-a", "total:1", "2026-08-09")],
    });

    expect(diff).toEqual([
      {
        kind: "moved_from",
        goalId: "goal-a",
        unitKey: "total:1",
        date: "2026-08-05",
        counterpartDate: "2026-08-09",
      },
      {
        kind: "moved_to",
        goalId: "goal-a",
        unitKey: "total:1",
        date: "2026-08-09",
        counterpartDate: "2026-08-05",
      },
    ]);
  });

  it("emits new entries for draft-only scheduled sessions", () => {
    const diff = diffPlannerAssignmentsForDraftVisual({
      baseAssignments: [],
      nextAssignments: [assignment("goal-b", "total:1", "2026-08-03")],
    });

    expect(diff).toEqual([
      {
        kind: "new",
        goalId: "goal-b",
        unitKey: "total:1",
        date: "2026-08-03",
        counterpartDate: null,
      },
    ]);
  });

  it("treats unscheduled-to-scheduled transitions as new placements", () => {
    const diff = diffPlannerAssignmentsForDraftVisual({
      baseAssignments: [assignment("goal-c", "total:2", null)],
      nextAssignments: [assignment("goal-c", "total:2", "2026-08-10")],
    });

    expect(diff).toEqual([
      {
        kind: "new",
        goalId: "goal-c",
        unitKey: "total:2",
        date: "2026-08-10",
        counterpartDate: null,
      },
    ]);
  });

  it("emits moved-from entries when draft removes a scheduled date", () => {
    const diff = diffPlannerAssignmentsForDraftVisual({
      baseAssignments: [assignment("goal-d", "total:3", "2026-08-15")],
      nextAssignments: [assignment("goal-d", "total:3", null)],
    });

    expect(diff).toEqual([
      {
        kind: "moved_from",
        goalId: "goal-d",
        unitKey: "total:3",
        date: "2026-08-15",
        counterpartDate: null,
      },
    ]);
  });
});
