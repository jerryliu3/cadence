import { describe, expect, it } from "vitest";
import {
  buildPlannerLinkedTargetIndexes,
  getLinkedTargetScopeStatus,
} from "@/features/planner/calendar-linked-targets";
import type { PlannerGoalLinkSummary } from "@cadence/shared/planner/context";

describe("buildPlannerLinkedTargetIndexes", () => {
  it("builds deterministic source/target indexes without duplicates", () => {
    const links: PlannerGoalLinkSummary[] = [
      {
        sourceGoalId: "goal-b",
        targetGoalId: "goal-c",
        sourcePlannedEndDate: "2026-12-31",
        targetSuppressionKind: "until",
        targetResumesOn: "2027-01-01",
      },
      {
        sourceGoalId: "goal-a",
        targetGoalId: "goal-c",
        sourcePlannedEndDate: "2026-03-31",
        targetSuppressionKind: "until",
        targetResumesOn: "2027-01-01",
      },
      {
        sourceGoalId: "goal-a",
        targetGoalId: "goal-c",
        sourcePlannedEndDate: "2026-03-31",
        targetSuppressionKind: "until",
        targetResumesOn: "2027-01-01",
      },
      {
        sourceGoalId: "goal-a",
        targetGoalId: "goal-b",
        sourcePlannedEndDate: "2026-03-31",
        targetSuppressionKind: "until",
        targetResumesOn: "2026-04-01",
      },
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
    expect(indexes.linksBySourceGoalId.get("goal-a")).toHaveLength(2);
    expect(indexes.linksByTargetGoalId.get("goal-c")).toHaveLength(2);
  });
});

describe("getLinkedTargetScopeStatus", () => {
  it("returns indefinite when target suppression is indefinite", () => {
    expect(
      getLinkedTargetScopeStatus({
        scopeMonth: "2026-08",
        targetSuppressionKind: "indefinite",
        targetResumesOn: null,
      })
    ).toEqual({
      state: "indefinite",
      resumeDate: null,
    });
  });

  it("returns suppressed from server metadata when resume date is in a future scope", () => {
    expect(
      getLinkedTargetScopeStatus({
        scopeMonth: "2026-08",
        targetSuppressionKind: "until",
        targetResumesOn: "2026-09-01",
      })
    ).toEqual({
      state: "suppressed",
      resumeDate: "2026-09-01",
    });
  });

  it("returns visible when the server resume date is already in or before scope", () => {
    expect(
      getLinkedTargetScopeStatus({
        scopeMonth: "2026-08",
        targetSuppressionKind: "until",
        targetResumesOn: "2026-08-01",
      })
    ).toEqual({
      state: "visible",
      resumeDate: null,
    });
  });

  it("falls back to source planned end date when server metadata is absent", () => {
    expect(
      getLinkedTargetScopeStatus({
        scopeMonth: "2026-08",
        sourcePlannedEndDate: "2026-07-31",
      })
    ).toEqual({
      state: "visible",
      resumeDate: null,
    });
  });
});
