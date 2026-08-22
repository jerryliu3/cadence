import { describe, expect, it } from "vitest";
import {
  buildPlannerLinkedTargetIndexes,
  describeLinkedTargetSuppression,
  getLinkedTargetScopeStatus,
} from "@/features/planner/calendar-linked-targets";
import type { PlannerGoalLinkSummary } from "@cadence/shared/planner/context";

describe("buildPlannerLinkedTargetIndexes", () => {
  it("builds deterministic source/target link indexes", () => {
    const links: PlannerGoalLinkSummary[] = [
      {
        sourceGoalId: "goal-b",
        targetGoalId: "goal-c",
        targetSuppressionKind: "until",
        targetResumesOn: "2027-01-01",
      },
      {
        sourceGoalId: "goal-a",
        targetGoalId: "goal-c",
        targetSuppressionKind: "until",
        targetResumesOn: "2027-01-01",
      },
      {
        sourceGoalId: "goal-a",
        targetGoalId: "goal-b",
        targetSuppressionKind: "until",
        targetResumesOn: "2026-04-01",
      },
    ];
    const indexes = buildPlannerLinkedTargetIndexes(links);

    expect(indexes.linksBySourceGoalId.get("goal-a")?.map((link) => link.targetGoalId)).toEqual([
      "goal-b",
      "goal-c",
    ]);
    expect(indexes.linksBySourceGoalId.get("goal-b")?.map((link) => link.targetGoalId)).toEqual([
      "goal-c",
    ]);
    expect(indexes.linksByTargetGoalId.get("goal-c")?.map((link) => link.sourceGoalId)).toEqual([
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
});

describe("describeLinkedTargetSuppression", () => {
  it("counts linked-target eligibility entries and deduplicates per-goal details", () => {
    const links: PlannerGoalLinkSummary[] = [
      {
        sourceGoalId: "source-z",
        targetGoalId: "goal-b",
        targetSuppressionKind: "until",
        targetResumesOn: "2026-09-01",
      },
      {
        sourceGoalId: "source-a",
        targetGoalId: "goal-b",
        targetSuppressionKind: "until",
        targetResumesOn: "2026-09-01",
      },
      {
        sourceGoalId: "source-c",
        targetGoalId: "goal-c",
        targetSuppressionKind: "indefinite",
        targetResumesOn: null,
      },
    ];

    const result = describeLinkedTargetSuppression({
      eligibility: [
        { goalId: "goal-b", eligible: false, reason: "linked_target" },
        { goalId: "goal-b", eligible: false, reason: "linked_target" },
        { goalId: "goal-c", eligible: false, reason: "linked_target" },
        { goalId: "goal-a", eligible: false, reason: "not_owner" },
      ],
      links,
      goalTitles: {
        "goal-b": "Goal B",
        "goal-c": "Goal C",
        "source-a": "Source A",
        "source-c": "Source C",
        "source-z": "Source Z",
      },
      scopeMonth: "2026-08",
    });

    expect(result.linkedTargetCount).toBe(3);
    expect(result.linkedTargetDetails).toEqual([
      {
        goalId: "goal-b",
        goalTitle: "Goal B",
        statusCopy: "hidden this month, returns Sep 1, 2026",
        sourceGoalTitles: ["Source A", "Source Z"],
      },
      {
        goalId: "goal-c",
        goalTitle: "Goal C",
        statusCopy: "hidden while linked subgoals are still active",
        sourceGoalTitles: ["Source C"],
      },
    ]);
  });

  it("uses a hidden-in-month fallback when linked-target metadata is missing", () => {
    const result = describeLinkedTargetSuppression({
      eligibility: [{ goalId: "goal-x", eligible: false, reason: "linked_target" }],
      links: [],
      goalTitles: {},
      scopeMonth: "2026-08",
    });

    expect(result).toEqual({
      linkedTargetCount: 1,
      linkedTargetDetails: [
        {
          goalId: "goal-x",
          goalTitle: "goal-x",
          statusCopy: "hidden in this month",
          sourceGoalTitles: [],
        },
      ],
    });
  });
});
