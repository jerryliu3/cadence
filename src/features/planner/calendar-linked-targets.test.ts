import { describe, expect, it } from "vitest";
import {
  buildPlannerLinkedTargetIndexes,
  getLinkedTargetScopeStatus,
} from "@/features/planner/calendar-linked-targets";

describe("buildPlannerLinkedTargetIndexes", () => {
  it("builds deterministic source/target indexes without duplicates", () => {
    const links = [
      { sourceGoalId: "goal-b", targetGoalId: "goal-c" },
      { sourceGoalId: "goal-a", targetGoalId: "goal-c" },
      { sourceGoalId: "goal-a", targetGoalId: "goal-c" },
      { sourceGoalId: "goal-a", targetGoalId: "goal-b" },
    ];
    const indexes = buildPlannerLinkedTargetIndexes(links);

    expect(indexes.targetsBySourceGoalId.get("goal-a")).toEqual([
      "goal-b",
      "goal-c",
    ]);
    expect(indexes.targetsBySourceGoalId.get("goal-b")).toEqual(["goal-c"]);
    expect(indexes.sourceGoalsByTargetGoalId.get("goal-c")).toEqual([
      "goal-a",
      "goal-b",
    ]);
  });
});

describe("getLinkedTargetScopeStatus", () => {
  it("returns indefinite for open-ended sources", () => {
    expect(
      getLinkedTargetScopeStatus({
        scopeMonth: "2026-08",
        sourceEndDate: null,
      })
    ).toEqual({
      state: "indefinite",
      resumeDate: null,
    });
  });

  it("returns suppressed through source end month with resume date", () => {
    expect(
      getLinkedTargetScopeStatus({
        scopeMonth: "2026-08",
        sourceEndDate: "2026-08-31",
      })
    ).toEqual({
      state: "suppressed",
      resumeDate: "2026-09-01",
    });
  });

  it("returns visible when the source ended before the scope month", () => {
    expect(
      getLinkedTargetScopeStatus({
        scopeMonth: "2026-08",
        sourceEndDate: "2026-07-31",
      })
    ).toEqual({
      state: "visible",
      resumeDate: null,
    });
  });
});
