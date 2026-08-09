import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import {
  computeRequirementFingerprint,
  getGoalRequirement,
  isTargetedRecurringGoal,
} from "./requirements";

function buildGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-id",
    owner_id: "owner-id",
    title: "Goal",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: null,
    milestone_names: null,
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("legacy goal requirement mapping", () => {
  it("maps recurring goals without a target to cadence", () => {
    expect(getGoalRequirement(buildGoal())).toEqual({
      kind: "cadence",
      interval: "weekly",
      maxPerDay: 1,
    });
  });

  it("maps every targeted recurring goal to deadline total", () => {
    const goal = buildGoal({ target_count: 12 });

    expect(isTargetedRecurringGoal(goal)).toBe(true);
    expect(getGoalRequirement(goal)).toEqual({
      kind: "deadline_total",
      targetCount: 12,
      maxPerDay: 1,
    });
  });

  it("maps fixed goals to ordered milestone labels", () => {
    expect(
      getGoalRequirement(
        buildGoal({
          frequency_type: "fixed_milestones",
          recurrence_interval: null,
          target_count: 3,
          milestone_names: ["Draft", "", "Ship"],
        })
      )
    ).toEqual({
      kind: "milestone_sequence",
      targetCount: 3,
      labels: ["Draft", "Milestone 2", "Ship"],
      maxPerDay: 1,
    });
  });

  it("keeps lineage stable for cosmetic edits and changes it for requirements", () => {
    const base = buildGoal({ target_count: 12 });
    expect(
      computeRequirementFingerprint({
        ...base,
        title: "Renamed",
        color: "#ffffff",
      })
    ).toBe(computeRequirementFingerprint(base));
    expect(
      computeRequirementFingerprint({ ...base, target_count: 13 })
    ).not.toBe(computeRequirementFingerprint(base));
  });

  it("fingerprints normalized semantics rather than legacy null encoding", () => {
    const fixed = buildGoal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: null,
      milestone_names: null,
    });

    expect(computeRequirementFingerprint(fixed)).toBe(
      computeRequirementFingerprint({ ...fixed, target_count: 1 })
    );
  });
});
