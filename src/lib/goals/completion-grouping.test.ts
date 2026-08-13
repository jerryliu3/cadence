import { describe, expect, it } from "vitest";
import {
  applyCompletionDateFact,
  countCompletionsByDate,
  getSortedCompletionDates,
  groupCompletionsByGoalId,
} from "./completion-grouping";

describe("groupCompletionsByGoalId", () => {
  it("groups rows by goal id", () => {
    const grouped = groupCompletionsByGoalId([
      { id: "a", goal_id: "goal-1", completed_on: "2026-08-10" },
      { id: "b", goal_id: "goal-2", completed_on: "2026-08-11" },
      { id: "c", goal_id: "goal-1", completed_on: "2026-08-12" },
    ]);

    expect(grouped.get("goal-1")?.map((row) => row.id)).toEqual(["a", "c"]);
    expect(grouped.get("goal-2")?.map((row) => row.id)).toEqual(["b"]);
  });
});

describe("countCompletionsByDate", () => {
  it("counts completion facts per date", () => {
    const counts = countCompletionsByDate([
      { completed_on: "2026-08-10" },
      { completed_on: "2026-08-11" },
      { completed_on: "2026-08-10" },
    ]);

    expect(counts).toEqual({
      "2026-08-10": 2,
      "2026-08-11": 1,
    });
  });
});

describe("applyCompletionDateFact", () => {
  it("adds a manual fact for the selected date", () => {
    expect(
      applyCompletionDateFact(
        [{ goal_id: "goal-1", completed_on: "2026-08-09", source: "manual" }],
        {
          goalId: "goal-1",
          date: "2026-08-10",
          desiredFactState: "present",
        }
      )
    ).toEqual([
      { goal_id: "goal-1", completed_on: "2026-08-09", source: "manual" },
      { goal_id: "goal-1", completed_on: "2026-08-10", source: "manual" },
    ]);
  });

  it("removes the matching date fact without touching other rows", () => {
    expect(
      applyCompletionDateFact(
        [
          { goal_id: "goal-1", completed_on: "2026-08-09", source: "manual" },
          { goal_id: "goal-1", completed_on: "2026-08-10", source: "manual" },
          { goal_id: "goal-2", completed_on: "2026-08-10", source: "manual" },
        ],
        {
          goalId: "goal-1",
          date: "2026-08-10",
          desiredFactState: "absent",
        }
      )
    ).toEqual([
      { goal_id: "goal-1", completed_on: "2026-08-09", source: "manual" },
      { goal_id: "goal-2", completed_on: "2026-08-10", source: "manual" },
    ]);
  });

  it("replaces a duplicate fact for the same goal and date", () => {
    expect(
      applyCompletionDateFact(
        [{ goal_id: "goal-1", completed_on: "2026-08-10", source: "linked_cascade" }],
        {
          goalId: "goal-1",
          date: "2026-08-10",
          desiredFactState: "present",
        }
      )
    ).toEqual([
      { goal_id: "goal-1", completed_on: "2026-08-10", source: "manual" },
    ]);
  });
});

describe("getSortedCompletionDates", () => {
  it("returns unique completion dates in ascending order", () => {
    expect(
      getSortedCompletionDates([
        { completed_on: "2026-08-11" },
        { completed_on: "2026-08-09" },
        { completed_on: "2026-08-11" },
        { completed_on: "2026-08-10" },
      ])
    ).toEqual(["2026-08-09", "2026-08-10", "2026-08-11"]);
  });
});
