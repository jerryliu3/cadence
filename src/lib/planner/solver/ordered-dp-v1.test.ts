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

  it("places fresh units nearest their independent ideal dates", () => {
    const result = solveOrderedDpV1({
      dates: ["2026-08-05", "2026-08-06", "2026-08-07"],
      units: [
        {
          unitKey: "total:1",
          goalId: "goal-a",
          kind: "deadline_total",
          ordinal: 1,
          candidateDates: ["2026-08-05", "2026-08-06", "2026-08-07"],
          previousDate: null,
          lockedDate: null,
          idealDate: "2026-08-07",
        },
      ],
    });

    expect(result.assignments[0].scheduledDate).toBe("2026-08-07");
  });

  it("places unanchored low-ordinal units after a preserved future anchor when their ideal dates land later", () => {
    // Reproduces the resumed-suppression prefix deadlock: ordinals 9-11 have
    // never been scheduled (no anchor) and their ideal dates fall inside the
    // window that opened up after the resumed date, while ordinal 12 is
    // already pinned to the first day of that window from a prior save.
    // Falling back to ordinal for the unanchored units would force them onto
    // a date before the pin, which their candidate dates cannot reach at
    // all -- an unsatisfiable prefix. Falling back to their ideal date lets
    // them correctly sort after the pin instead.
    const dates = [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ];
    const unanchoredAfterResume = (ordinal: number, idealDate: string) => ({
      unitKey: `milestone:${ordinal}`,
      goalId: "goal-a",
      kind: "milestone_sequence" as const,
      ordinal,
      candidateDates: dates,
      previousDate: null,
      lockedDate: null,
      idealDate,
    });
    const result = solveOrderedDpV1({
      dates,
      units: [
        unanchoredAfterResume(9, "2026-09-02"),
        unanchoredAfterResume(10, "2026-09-03"),
        unanchoredAfterResume(11, "2026-09-04"),
        {
          unitKey: "milestone:12",
          goalId: "goal-a",
          kind: "milestone_sequence",
          ordinal: 12,
          candidateDates: ["2026-09-01"],
          previousDate: "2026-09-01",
          lockedDate: "2026-09-01",
        },
      ],
    });

    expect(result.placementStatus).toBe("complete");
    expect(result.issueCodes).toEqual([]);
    expect(
      result.assignments.map(
        (assignment) => `${assignment.unitKey}=${assignment.scheduledDate}`
      )
    ).toEqual([
      "milestone:9=2026-09-02",
      "milestone:10=2026-09-03",
      "milestone:11=2026-09-04",
      "milestone:12=2026-09-01",
    ]);
  });

  it("interleaves anchored and unanchored milestones by real date rather than ordinal", () => {
    // Ordinal 5 already sits on 08-10 (a real anchor). Ordinals 1 and 10 have
    // never been scheduled, but their ideal dates fall on either side of that
    // anchor. Ordinal rank alone would force 1 before 5 and 10 after 5 anyway
    // in this case -- the point is that it now happens because their ideal
    // dates genuinely fall there, not because of their ordinal position.
    const dates = ["2026-08-01", "2026-08-10", "2026-08-20"];
    const result = solveOrderedDpV1({
      dates,
      units: [
        {
          unitKey: "milestone:10",
          goalId: "goal-a",
          kind: "milestone_sequence",
          ordinal: 10,
          candidateDates: dates,
          previousDate: null,
          lockedDate: null,
          idealDate: "2026-08-20",
        },
        {
          unitKey: "milestone:1",
          goalId: "goal-a",
          kind: "milestone_sequence",
          ordinal: 1,
          candidateDates: dates,
          previousDate: null,
          lockedDate: null,
          idealDate: "2026-08-01",
        },
        {
          unitKey: "milestone:5",
          goalId: "goal-a",
          kind: "milestone_sequence",
          ordinal: 5,
          candidateDates: dates,
          previousDate: "2026-08-10",
          lockedDate: "2026-08-10",
        },
      ],
    });

    expect(result.placementStatus).toBe("complete");
    // Output order is stable by (goalId, ordinal, unitKey) regardless of
    // internal solve order, so this reads back sorted by ordinal.
    expect(
      result.assignments.map(
        (assignment) => `${assignment.unitKey}=${assignment.scheduledDate}`
      )
    ).toEqual([
      "milestone:1=2026-08-01",
      "milestone:5=2026-08-10",
      "milestone:10=2026-08-20",
    ]);
  });

  it("never lets an unanchored unit's ideal date override another unit's real lock", () => {
    // Two units both want 08-05 by ideal date, but one is genuinely locked
    // there. The lock must win the date outright regardless of ideal-date
    // based solve order for the other unit.
    const dates = ["2026-08-05", "2026-08-06"];
    const result = solveOrderedDpV1({
      dates,
      units: [
        {
          unitKey: "total:2",
          goalId: "goal-a",
          kind: "deadline_total",
          ordinal: 2,
          candidateDates: dates,
          previousDate: null,
          lockedDate: null,
          idealDate: "2026-08-05",
        },
        {
          unitKey: "total:1",
          goalId: "goal-a",
          kind: "deadline_total",
          ordinal: 1,
          candidateDates: ["2026-08-05"],
          previousDate: "2026-08-05",
          lockedDate: "2026-08-05",
        },
      ],
    });

    expect(result.placementStatus).toBe("complete");
    expect(
      result.assignments.find((assignment) => assignment.unitKey === "total:1")
        ?.scheduledDate
    ).toBe("2026-08-05");
    expect(
      result.assignments.find((assignment) => assignment.unitKey === "total:2")
        ?.scheduledDate
    ).toBe("2026-08-06");
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
