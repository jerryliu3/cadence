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

  it("places what it can when another unit has no candidate dates", () => {
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

    // An unplaceable unit no longer blocks the rest: ordinal is identity, so
    // there is no prefix for it to terminate.
    expect(result.issueCodes).toEqual(["placement_shortfall"]);
    expect(result.publishable).toBe(true);
    expect(
      result.assignments.find((a) => a.unitKey === "total:2")?.scheduledDate
    ).toBe("2026-08-05");
  });

  it("keeps unaffected goal assignments when another goal has colliding locks", () => {
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
          // Two units of one goal cannot hold the same date -- still invalid.
          lockedDate: "2026-08-10",
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

describe("solve intent objective ordering", () => {
  const dates = ["2026-08-05", "2026-08-06"];
  // Sitting on its previous date costs policy; moving one day is compliant.
  const unit = {
    unitKey: "total:1",
    goalId: "goal-a",
    kind: "deadline_total" as const,
    ordinal: 1,
    candidateDates: dates,
    previousDate: "2026-08-05",
    lockedDate: null,
    dateCosts: { "2026-08-05": 10, "2026-08-06": 0 },
  };

  it("keeps the existing date under stable intent", () => {
    const result = solveOrderedDpV1({ dates, units: [unit] });

    expect(result.assignments[0].scheduledDate).toBe("2026-08-05");
  });

  it("pays a move to lower policy cost under replan intent", () => {
    const result = solveOrderedDpV1({
      dates,
      units: [unit],
      solveIntent: "replan",
    });

    expect(result.assignments[0].scheduledDate).toBe("2026-08-06");
  });

  it("still breaks policy-equal ties by fewest moves under replan intent", () => {
    const result = solveOrderedDpV1({
      dates,
      units: [{ ...unit, dateCosts: { "2026-08-05": 0, "2026-08-06": 0 } }],
      solveIntent: "replan",
    });

    expect(result.assignments[0].scheduledDate).toBe("2026-08-05");
  });

  it("never breaks a hard lock to satisfy policy under replan intent", () => {
    const result = solveOrderedDpV1({
      dates,
      units: [{ ...unit, lockedDate: "2026-08-05" }],
      solveIntent: "replan",
    });

    expect(result.assignments[0].scheduledDate).toBe("2026-08-05");
  });
});

describe("shortfall selection", () => {
  // Which units go unplaced under capacity pressure is no longer a structural
  // rule; it falls out of the objective. Pinned here so a later change to the
  // objective cannot silently alter which sessions disappear.
  const dates = ["2026-08-01", "2026-08-02", "2026-08-03"];
  const unit = (ordinal: number, previousDate: string | null) => ({
    unitKey: `total:${ordinal}`,
    goalId: "goal-a",
    kind: "deadline_total" as const,
    ordinal,
    candidateDates: dates,
    previousDate,
    lockedDate: null,
  });
  const placed = (result: ReturnType<typeof solveOrderedDpV1>) =>
    result.assignments.map(
      (assignment) => `${assignment.unitKey}=${assignment.scheduledDate}`
    );

  it("drops the highest ordinals when nothing is scheduled yet", () => {
    const result = solveOrderedDpV1({
      dates,
      units: [1, 2, 3, 4, 5].map((ordinal) => unit(ordinal, null)),
    });

    // Every option ties on `moved`, so `compareSolveOrder` falls back to
    // ordinal and the tail drops -- the same answer the old prefix rule gave.
    expect(placed(result)).toEqual([
      "total:1=2026-08-01",
      "total:2=2026-08-02",
      "total:3=2026-08-03",
      "total:4=null",
      "total:5=null",
    ]);
    expect(result.issueCodes).toEqual(["placement_shortfall"]);
  });

  it("keeps already-scheduled units even when they carry higher ordinals", () => {
    const result = solveOrderedDpV1({
      dates,
      units: [
        unit(1, null),
        unit(2, null),
        unit(3, "2026-08-01"),
        unit(4, "2026-08-02"),
        unit(5, "2026-08-03"),
      ],
    });

    // Placing a unit on its own date costs `moved: 0`, so the established units
    // win the slots and capacity pressure falls on what the user has not seen
    // yet. Ordinal deliberately loses here: it is identity, not priority.
    expect(placed(result)).toEqual([
      "total:1=null",
      "total:2=null",
      "total:3=2026-08-01",
      "total:4=2026-08-02",
      "total:5=2026-08-03",
    ]);
  });
});
