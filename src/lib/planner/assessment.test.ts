import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import {
  computeAssessmentInputHash,
  createDefaultAssessment,
  goalAssessmentSchema,
} from "@/lib/planner/assessment";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-a",
    owner_id: "owner-a",
    title: "Practice",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: 5,
    milestone_names: null,
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("planner goal assessments", () => {
  it("provides bounded defaults that do not require AI", () => {
    expect(createDefaultAssessment(goal())).toMatchObject({
      estimatedMinutesPerSession: 30,
      difficulty: 3,
      priority: 3,
      confidence: "low",
      source: "default",
    });
  });

  it("invalidates reuse after assessment-relevant edits", () => {
    const original = goal();
    const renamed = goal({ title: "Renamed" });
    expect(
      computeAssessmentInputHash(
        original,
        normalizeGoalRequirement(original)
      )
    ).not.toBe(
      computeAssessmentInputHash(
        renamed,
        normalizeGoalRequirement(renamed)
      )
    );
  });

  it("rejects out-of-range executable fields", () => {
    expect(() =>
      goalAssessmentSchema.parse({
        ...createDefaultAssessment(goal()),
        estimatedMinutesPerSession: 481,
      })
    ).toThrow();
  });
});
