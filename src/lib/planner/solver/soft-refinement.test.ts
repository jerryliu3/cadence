import { describe, expect, it } from "vitest";
import { refineDailyLoadVariance } from "@/lib/planner/solver/soft-refinement";
import type { SolverUnit } from "@/lib/planner/solver/types";

function unit(goalId: string): SolverUnit {
  return {
    goalId,
    unitKey: "total:1",
    kind: "deadline_total",
    ordinal: 1,
    candidateDates: ["2026-08-01", "2026-08-02"],
    previousDate: null,
    lockedDate: null,
    idealDate: null,
    estimatedMinutes: 30,
  };
}

describe("bounded soft load refinement", () => {
  it("spreads cross-goal work without changing cardinality or prior costs", () => {
    const result = refineDailyLoadVariance({
      dates: ["2026-08-01", "2026-08-02"],
      units: [unit("goal-a"), unit("goal-b")],
      assignments: [
        {
          goalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-01",
        },
        {
          goalId: "goal-b",
          unitKey: "total:1",
          scheduledDate: "2026-08-01",
        },
      ],
      operationBudget: 100,
    });

    expect(
      result.assignments.map((assignment) => assignment.scheduledDate).sort()
    ).toEqual(["2026-08-01", "2026-08-02"]);
    expect(result.exhausted).toBe(false);
  });

  it("returns a hard-feasible result when its deterministic budget ends", () => {
    const result = refineDailyLoadVariance({
      dates: ["2026-08-01", "2026-08-02"],
      units: [unit("goal-a"), unit("goal-b")],
      assignments: [
        {
          goalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-01",
        },
        {
          goalId: "goal-b",
          unitKey: "total:1",
          scheduledDate: "2026-08-01",
        },
      ],
      operationBudget: 1,
    });

    expect(result.exhausted).toBe(true);
    expect(result.assignments.every((assignment) => assignment.scheduledDate)).toBe(
      true
    );
  });
});
