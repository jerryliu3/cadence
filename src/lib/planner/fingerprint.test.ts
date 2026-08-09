import { describe, expect, it } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import { createDefaultAssessment } from "@/lib/planner/assessment";
import {
  computeGenerationInputHash,
  type GenerationHashInput,
} from "@/lib/planner/fingerprint";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

const goal: Goal = {
  id: "goal-a",
  owner_id: "owner-a",
  title: "Goal",
  description: null,
  category: "Personal",
  color: null,
  frequency_type: "recurring",
  recurrence_interval: "weekly",
  target_count: 2,
  milestone_names: null,
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  photo_path: null,
  is_group: false,
  is_deleted: false,
  archived_at: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const completion: Completion = {
  id: "completion-a",
  goal_id: "goal-a",
  user_id: "owner-a",
  completed_on: "2026-08-05",
  source: "manual",
  created_at: "2026-08-05T12:00:00Z",
};

function input(): GenerationHashInput {
  return {
    eligibilityMode: "overlap_v1",
    solveIntent: "stable",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-10",
    timezone: "UTC",
    goals: [goal],
    completions: [completion],
    links: [],
    assessments: [createDefaultAssessment(goal)],
    policy: createDefaultPlannerPolicy(
      "UTC",
      "2026-08-01T00:00:00Z"
    ),
    basePlan: null,
  };
}

describe("strict generation input fingerprint", () => {
  it("changes for canonical facts but not external revision counters", () => {
    const base = input();
    const withRevision = {
      ...base,
      canonicalRevision: 100,
      executionRevision: 200,
    } as GenerationHashInput;
    const withChangedFact = {
      ...base,
      completions: [{ ...completion, completed_on: "2026-08-06" }],
    };

    expect(computeGenerationInputHash(withRevision)).toBe(
      computeGenerationInputHash(base)
    );
    expect(computeGenerationInputHash(withChangedFact)).not.toBe(
      computeGenerationInputHash(base)
    );
  });

  it("normalizes canonical collection ordering", () => {
    const secondGoal = { ...goal, id: "goal-b" };
    const first = { ...input(), goals: [goal, secondGoal] };
    const second = { ...input(), goals: [secondGoal, goal] };

    expect(computeGenerationInputHash(first)).toBe(
      computeGenerationInputHash(second)
    );
  });

  it("normalizes set-like policy ordering before hashing", () => {
    const first = input();
    first.policy.restWeekdays = [1, 2];
    const second = input();
    second.policy.restWeekdays = [2, 1, 1];

    expect(computeGenerationInputHash(first)).toBe(
      computeGenerationInputHash(second)
    );
  });
});
