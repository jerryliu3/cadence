import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import { runPlannerKernel, type PlannerKernelInput } from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-a",
    owner_id: "owner-a",
    title: "Practice presentation",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: 12,
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

function makeInput(
  goal: Goal,
  draftPinnedDates: Record<string, string> = {}
): PlannerKernelInput {
  return {
    schemaVersion: "1",
    eligibilityMode: "overlap_v1",
    ownerId: "owner-a",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-01",
    timezone: "UTC",
    goals: [goal],
    completions: [],
    links: [],
    policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z"),
    basePlan: null,
    draftPinnedDates,
  };
}

function movedUnits(
  before: ReturnType<typeof runPlannerKernel>,
  after: ReturnType<typeof runPlannerKernel>
) {
  const beforeByKey = new Map(
    before.workUnits.map((unit) => [unit.unitKey, unit.scheduledDate])
  );
  return after.workUnits
    .filter((unit) => beforeByKey.get(unit.unitKey) !== unit.scheduledDate)
    .map((unit) => ({
      unitKey: unit.unitKey,
      from: beforeByKey.get(unit.unitKey) ?? null,
      to: unit.scheduledDate,
    }));
}

describe("ordinal is identity, not sequence", () => {
  it("moves only the pinned session of an interchangeable goal", () => {
    const goal = makeGoal();
    const before = runPlannerKernel(makeInput(goal));
    const after = runPlannerKernel(
      makeInput(goal, { "goal-a:total:3": "2026-08-19" })
    );

    expect(movedUnits(before, after)).toEqual([
      { unitKey: "total:3", from: "2026-08-03", to: "2026-08-19" },
    ]);
  });

  it("moves only the pinned milestone and keeps its label with it", () => {
    const goal = makeGoal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 3,
      milestone_names: ["Buy engine", "Buy wheel", "Assemble"],
    });
    const before = runPlannerKernel(makeInput(goal));
    const after = runPlannerKernel(
      makeInput(goal, { "goal-a:milestone:1": "2026-08-19" })
    );

    expect(movedUnits(before, after)).toEqual([
      { unitKey: "milestone:1", from: "2026-08-01", to: "2026-08-19" },
    ]);
    expect(
      after.workUnits.map((unit) => `${unit.label}@${unit.scheduledDate}`)
    ).toEqual([
      "Buy engine@2026-08-19",
      "Buy wheel@2026-08-02",
      "Assemble@2026-08-03",
    ]);
    expect(after.solver.issueCodes).toEqual([]);
  });

  it("keeps a second pin from disturbing the first", () => {
    const goal = makeGoal();
    const before = runPlannerKernel(makeInput(goal));
    const after = runPlannerKernel(
      makeInput(goal, {
        "goal-a:total:12": "2026-08-25",
        "goal-a:total:11": "2026-08-23",
      })
    );

    expect(movedUnits(before, after)).toEqual([
      { unitKey: "total:11", from: "2026-08-11", to: "2026-08-23" },
      { unitKey: "total:12", from: "2026-08-12", to: "2026-08-25" },
    ]);
  });

  it("is deterministic across repeated solves", () => {
    const goal = makeGoal();
    const pins = { "goal-a:total:3": "2026-08-19" };
    const first = runPlannerKernel(makeInput(goal, pins));
    const second = runPlannerKernel(makeInput(goal, pins));

    expect(second.workUnits.map((unit) => unit.scheduledDate)).toEqual(
      first.workUnits.map((unit) => unit.scheduledDate)
    );
    expect(second.generationInputHash).toBe(first.generationInputHash);
  });
});

describe("locks and pins coexist", () => {
  it("keeps a hard-locked unit on its lock while another unit is pinned", () => {
    const goal = makeGoal({ target_count: 3 });
    const basePlan = {
      planId: "plan-a",
      version: 1,
      assignments: [
        {
          goalId: "goal-a",
          requirementFingerprint: computeRequirementFingerprint(goal),
          unitKey: "total:1",
          scheduledDate: "2026-08-05",
          locked: false,
        },
        {
          goalId: "goal-a",
          requirementFingerprint: computeRequirementFingerprint(goal),
          unitKey: "total:2",
          scheduledDate: "2026-08-25",
          locked: true,
        },
        {
          goalId: "goal-a",
          requirementFingerprint: computeRequirementFingerprint(goal),
          unitKey: "total:3",
          scheduledDate: "2026-08-07",
          locked: false,
        },
      ],
    };
    const before = runPlannerKernel({ ...makeInput(goal), basePlan });
    const after = runPlannerKernel({
      ...makeInput(goal, { "goal-a:total:1": "2026-08-19" }),
      basePlan,
    });

    expect(
      after.workUnits.find((unit) => unit.unitKey === "total:2")?.scheduledDate
    ).toBe("2026-08-25");
    expect(movedUnits(before, after)).toEqual([
      { unitKey: "total:1", from: "2026-08-05", to: "2026-08-19" },
    ]);
  });
});
