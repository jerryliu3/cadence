import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";
import {
  isPlannerGoalUnplaceableRecordValid,
  summarizePlannerGoalUnplaceableRecords,
  type PlannerGoalUnplaceableRecord,
} from "@/lib/planner/unplaceable";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Read 30 books",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "fixed_milestones",
    recurrence_interval: null,
    target_count: 30,
    milestone_names: Array.from({ length: 30 }, (_, index) => `Book ${index + 1}`),
    start_date: "2026-08-01",
    end_date: "2026-12-31",
    default_local_time: null,
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function record(
  input: Partial<PlannerGoalUnplaceableRecord> = {}
): PlannerGoalUnplaceableRecord {
  const baselineGoal = goal();
  return {
    goalId: input.goalId ?? baselineGoal.id,
    requirementFingerprint:
      input.requirementFingerprint ?? computeRequirementFingerprint(baselineGoal),
    policyRevision: input.policyRevision ?? 2,
    lockSignature: input.lockSignature ?? "lock-signature",
    effectiveSpanEnd: input.effectiveSpanEnd ?? "2027-07-31",
    unplacedCount: input.unplacedCount ?? 8,
    reason: input.reason ?? "capacity",
    computedAt: input.computedAt ?? "2026-08-15T00:00:00.000Z",
  };
}

describe("planner unplaceable helpers", () => {
  it("accepts a record when fingerprint, policy revision, and span end match", () => {
    const plannerGoal = goal();
    const unplaceable = record({
      goalId: plannerGoal.id,
      requirementFingerprint: computeRequirementFingerprint(plannerGoal),
      policyRevision: 3,
      effectiveSpanEnd: "2027-07-31",
    });
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: unplaceable,
        goal: plannerGoal,
        policyRevision: 3,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(true);
  });

  it("invalidates when fingerprint mismatches", () => {
    const plannerGoal = goal();
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          requirementFingerprint: "b".repeat(64),
        }),
        goal: plannerGoal,
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(false);
  });

  it("invalidates when policy revision mismatches", () => {
    const plannerGoal = goal();
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({ goalId: plannerGoal.id, policyRevision: 4 }),
        goal: plannerGoal,
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(false);
  });

  it("invalidates when record span end is behind current effective span", () => {
    const plannerGoal = goal({ end_date: "2027-09-30" });
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          requirementFingerprint: computeRequirementFingerprint(plannerGoal),
          effectiveSpanEnd: "2027-08-31",
        }),
        goal: plannerGoal,
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-09-30",
      })
    ).toBe(false);
  });

  it("keeps validity when record span end is beyond current effective span", () => {
    const plannerGoal = goal({ end_date: "2026-12-31" });
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          requirementFingerprint: computeRequirementFingerprint(plannerGoal),
          effectiveSpanEnd: "2027-07-31",
        }),
        goal: plannerGoal,
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(true);
  });

  it("invalidates when lock signature mismatches", () => {
    const plannerGoal = goal();
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          lockSignature: "prior-lock-signature",
        }),
        goal: plannerGoal,
        policyRevision: 2,
        lockSignature: "next-lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(false);
  });

  it("summarizes unresolved goals in descending unresolved order", () => {
    const summary = summarizePlannerGoalUnplaceableRecords({
      records: [
        record({
          goalId: "goal-b",
          unplacedCount: 1,
          reason: "invalid_lock",
        }),
        record({
          goalId: "goal-a",
          unplacedCount: 4,
          reason: "capacity",
        }),
      ],
      goalTitles: {
        "goal-a": "A",
        "goal-b": "B",
      },
    });
    expect(summary).toEqual([
      expect.objectContaining({
        goalId: "goal-a",
        title: "A",
        unplacedCount: 4,
        reason: "capacity",
      }),
      expect.objectContaining({
        goalId: "goal-b",
        title: "B",
        unplacedCount: 1,
        reason: "invalid_lock",
      }),
    ]);
  });
});
