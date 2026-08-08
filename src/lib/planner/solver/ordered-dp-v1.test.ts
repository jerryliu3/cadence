import { describe, expect, it } from "vitest";
import solverFixtureJson from "../../../../test/fixtures/planner-contracts/solver.v1.json";
import { solverFixtureSchema } from "@/lib/planner/contracts/fixture-schema";
import { solveOrderedDpV1 } from "./ordered-dp-v1";

describe("ordered-dp-v1 solver", () => {
  const fixture = solverFixtureSchema.parse(solverFixtureJson);

  it.each(fixture.cases)("$id", (fixtureCase) => {
    expect(
      solveOrderedDpV1({
        dates: fixtureCase.dates,
        units: fixtureCase.units,
        simulateSoftBudgetExhaustion:
          fixtureCase.simulateSoftBudgetExhaustion,
      })
    ).toEqual(fixtureCase.expected);
  });

  it("separates hard feasibility by goal without a global day cap", () => {
    const units = ["goal-a", "goal-b"].map((goalId) => ({
      unitKey: "total:1",
      goalId,
      kind: "deadline_total" as const,
      ordinal: 1,
      candidateDates: ["2026-08-05"],
      previousDate: null,
      lockedDate: null,
    }));
    const result = solveOrderedDpV1({
      dates: ["2026-08-05"],
      units,
    });

    expect(result.placementStatus).toBe("complete");
    expect(result.assignments.map((assignment) => assignment.scheduledDate)).toEqual([
      "2026-08-05",
      "2026-08-05",
    ]);
    expect(
      solveOrderedDpV1({
        dates: ["2026-08-05"],
        units: [...units].reverse(),
      })
    ).toEqual(result);
  });

  it("handles the full work-unit bound in one goal without recursion", () => {
    const result = solveOrderedDpV1({
      dates: ["2026-08-01"],
      units: Array.from({ length: 5_000 }, (_, index) => ({
        unitKey: `total:${index + 1}`,
        goalId: "goal-a",
        kind: "deadline_total" as const,
        ordinal: index + 1,
        candidateDates: [],
        previousDate: null,
        lockedDate: null,
      })),
    });

    expect(result.assignments).toHaveLength(5_000);
    expect(result.placementStatus).toBe("partial");
  });

  it("treats a locked successor behind an impossible prefix as invalid", () => {
    const result = solveOrderedDpV1({
      dates: ["2026-08-05"],
      units: [
        {
          unitKey: "total:1",
          goalId: "goal-a",
          kind: "deadline_total",
          ordinal: 1,
          candidateDates: [],
          previousDate: null,
          lockedDate: null,
        },
        {
          unitKey: "total:2",
          goalId: "goal-a",
          kind: "deadline_total",
          ordinal: 2,
          candidateDates: ["2026-08-05"],
          previousDate: "2026-08-05",
          lockedDate: "2026-08-05",
        },
      ],
    });

    expect(result.issueCodes).toEqual(["invalid_lock"]);
    expect(result.publishable).toBe(false);
  });

  it("keeps unaffected goal assignments when another goal has invalid locks", () => {
    const result = solveOrderedDpV1({
      dates: ["2026-08-05", "2026-08-10"],
      units: [
        {
          unitKey: "total:1",
          goalId: "goal-a",
          kind: "deadline_total",
          ordinal: 1,
          candidateDates: ["2026-08-05", "2026-08-10"],
          previousDate: "2026-08-10",
          lockedDate: "2026-08-10",
        },
        {
          unitKey: "total:2",
          goalId: "goal-a",
          kind: "deadline_total",
          ordinal: 2,
          candidateDates: ["2026-08-05", "2026-08-10"],
          previousDate: "2026-08-05",
          lockedDate: "2026-08-05",
        },
        {
          unitKey: "total:1",
          goalId: "goal-b",
          kind: "deadline_total",
          ordinal: 1,
          candidateDates: ["2026-08-05"],
          previousDate: null,
          lockedDate: null,
        },
      ],
    });

    expect(result.searchStatus).toBe("blocked_invalid_lock");
    expect(result.invalidGoalIds).toEqual(["goal-a"]);
    expect(
      result.assignments.find(
        (assignment) => assignment.goalId === "goal-b"
      )?.scheduledDate
    ).toBe("2026-08-05");
  });

  it("never refines onto a date outside the solver scope", () => {
    const result = solveOrderedDpV1({
      dates: ["2026-08-01"],
      units: [
        {
          unitKey: "total:1",
          goalId: "goal-a",
          kind: "deadline_total",
          ordinal: 1,
          candidateDates: ["2026-08-01", "2026-08-03"],
          previousDate: null,
          lockedDate: null,
        },
      ],
    });

    expect(result.assignments[0].scheduledDate).toBe("2026-08-01");
  });
});
