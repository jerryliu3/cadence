import { describe, expect, it } from "vitest";
import { getCreditedUnitCount } from "@/lib/goals/admissible";
import type { Completion, Goal } from "@/lib/goals/types";
import { enumerateMonthsInWindow } from "@/lib/planner/dates";
import { runPlannerKernel, type PlannerKernelInput } from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

function buildGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-oracle",
    owner_id: "owner-oracle",
    title: "Oracle goal",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: 6,
    milestone_names: null,
    start_date: "2026-08-01",
    end_date: "2026-10-31",
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function buildCompletion(
  goalId: string,
  completedOn: string,
  index: number,
  source: Completion["source"] = "manual"
): Completion {
  return {
    id: `${goalId}-${completedOn}-${index}`,
    goal_id: goalId,
    user_id: "owner-oracle",
    completed_on: completedOn,
    source,
    created_at: `${completedOn}T12:00:00Z`,
  };
}

function runKernelByMonth({
  goal,
  completions,
  asOfDate,
}: {
  goal: Goal;
  completions: Completion[];
  asOfDate: string;
}) {
  const months =
    goal.end_date === null
      ? [goal.start_date.slice(0, 7), asOfDate.slice(0, 7)]
      : enumerateMonthsInWindow({
          start: goal.start_date,
          end: goal.end_date,
        });
  const uniqueMonths = Array.from(new Set(months)).sort((left, right) =>
    left.localeCompare(right)
  );
  const policy = createDefaultPlannerPolicy("UTC", `${asOfDate}T00:00:00Z`);
  const outputs = uniqueMonths.map((scopeMonth) =>
    runPlannerKernel({
      schemaVersion: "1",
      eligibilityMode: "overlap_v1",
      ownerId: goal.owner_id,
      scopeMonth,
      asOfDate,
      timezone: "UTC",
      goals: [goal],
      completions,
      links: [],
      policy,
      basePlan: null,
    } satisfies PlannerKernelInput)
  );

  const creditedCompletionIds = new Set<string>();
  for (const output of outputs) {
    for (const completionId of Object.keys(output.completionToUnit)) {
      creditedCompletionIds.add(completionId);
    }
  }
  return { outputs, creditedCompletionIds };
}

describe("progress oracle alignment", () => {
  it("keeps deadline-total credited counts aligned across progress and planner reconciliation", () => {
    const goal = buildGoal();
    const completions: Completion[] = [
      buildCompletion(goal.id, "2026-08-03", 1),
      buildCompletion(goal.id, "2026-08-20", 2),
      buildCompletion(goal.id, "2026-09-05", 3),
      buildCompletion(goal.id, "2026-09-28", 4),
      buildCompletion(goal.id, "2026-10-02", 5),
      buildCompletion(goal.id, "2026-10-15", 6),
      buildCompletion(goal.id, "2026-10-25", 7),
      buildCompletion(goal.id, "2026-11-01", 8),
    ];
    const asOfDate = "2026-10-20";
    const expectedCreditedCount = getCreditedUnitCount(goal, completions, {
      asOfDate,
    });

    const { creditedCompletionIds, outputs } = runKernelByMonth({
      goal,
      completions,
      asOfDate,
    });

    expect(outputs.every((output) => output.validation.valid)).toBe(true);
    expect(creditedCompletionIds.size).toBe(expectedCreditedCount);
    expect(Array.from(creditedCompletionIds).sort()).toEqual(
      completions.slice(0, 6).map((completion) => completion.id).sort()
    );
  });

  it("keeps cadence credited counts aligned across progress and planner reconciliation", () => {
    const goal = buildGoal({
      id: "goal-cadence-open",
      recurrence_interval: "weekly",
      target_count: null,
      end_date: null,
    });
    const completions: Completion[] = [
      buildCompletion(goal.id, "2026-08-03", 1),
      buildCompletion(goal.id, "2026-08-05", 2),
      buildCompletion(goal.id, "2026-08-10", 3),
      buildCompletion(goal.id, "2026-08-17", 4),
      buildCompletion(goal.id, "2026-09-02", 5),
      buildCompletion(goal.id, "2026-09-09", 6),
      buildCompletion(goal.id, "2026-10-01", 7),
    ];
    const asOfDate = "2026-09-20";
    const expectedCreditedCount = getCreditedUnitCount(goal, completions, {
      asOfDate,
    });

    const { creditedCompletionIds, outputs } = runKernelByMonth({
      goal,
      completions,
      asOfDate,
    });

    expect(outputs.every((output) => output.validation.valid)).toBe(true);
    expect(creditedCompletionIds.size).toBe(expectedCreditedCount);
  });
});
