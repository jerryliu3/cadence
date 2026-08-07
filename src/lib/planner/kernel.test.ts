import { describe, expect, it } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import {
  runPlannerKernel,
  type PlannerKernelInput,
} from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";
import { PlannerError } from "@/lib/planner/errors";

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
    target_count: 3,
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

function input(overrides: Partial<PlannerKernelInput> = {}): PlannerKernelInput {
  return {
    schemaVersion: "1",
    eligibilityMode: "end_month_v1",
    ownerId: "owner-a",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-05",
    timezone: "UTC",
    goals: [goal()],
    completions: [],
    links: [],
    policy: createDefaultPlannerPolicy(
      "UTC",
      "2026-08-01T00:00:00Z"
    ),
    basePlan: null,
    ...overrides,
  };
}

describe("pure planner kernel", () => {
  it("runs the end-month pipeline deterministically", () => {
    const first = runPlannerKernel(input());
    const second = runPlannerKernel(input({ goals: [...input().goals] }));

    expect(first.generationInputHash).toBe(second.generationInputHash);
    expect(first.solver).toMatchObject({
      placementStatus: "complete",
      searchStatus: "all_units_placed",
      publishable: true,
    });
    expect(first.workUnits.map((unit) => unit.unitKey)).toEqual([
      "total:1",
      "total:2",
      "total:3",
    ]);
    expect(first.validation.valid).toBe(true);
  });

  it("does not inflate planned ordinal totals when toggling months", () => {
    const longGoal = goal({
      target_count: 9,
      start_date: "2026-08-01",
      end_date: "2026-10-31",
    });
    const monthOutputs = ["2026-08", "2026-09", "2026-10"].map((scopeMonth) =>
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          scopeMonth,
          asOfDate: "2026-08-05",
          goals: [longGoal],
        })
      )
    );
    const allUnitKeys = monthOutputs.flatMap((output) =>
      output.workUnits.map((unit) => unit.unitKey)
    );
    const uniqueUnitKeys = new Set(allUnitKeys);

    expect(allUnitKeys).toHaveLength(longGoal.target_count ?? 0);
    expect(uniqueUnitKeys.size).toBe(longGoal.target_count);
    expect(
      Math.max(...monthOutputs.map((output) => output.workUnits.length))
    ).toBeLessThan(longGoal.target_count ?? 0);
  });

  it("carries forward elapsed ordinal obligations into remaining months", () => {
    const longGoal = goal({
      target_count: 60,
      start_date: "2026-08-01",
      end_date: "2027-01-31",
    });
    const monthOutputs = ["2026-10", "2026-11", "2026-12", "2027-01"].map(
      (scopeMonth) =>
        runPlannerKernel(
          input({
            eligibilityMode: "overlap_v1",
            scopeMonth,
            asOfDate: "2026-10-15",
            goals: [longGoal],
          })
        )
    );
    const allUnitKeys = monthOutputs.flatMap((output) =>
      output.workUnits.map((unit) => unit.unitKey)
    );

    expect(allUnitKeys).toHaveLength(longGoal.target_count ?? 0);
    expect(new Set(allUnitKeys).size).toBe(longGoal.target_count);
    expect(monthOutputs[0].workUnits.length).toBeGreaterThan(10);
  });

  it("spills ordinal allocations forward when current-month capacity is constrained", () => {
    const constrainedStartGoal = goal({
      target_count: 60,
      start_date: "2026-08-20",
      end_date: "2026-10-31",
    });
    const monthOutputs = ["2026-08", "2026-09", "2026-10"].map((scopeMonth) =>
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          scopeMonth,
          asOfDate: "2026-08-20",
          goals: [constrainedStartGoal],
        })
      )
    );
    const allUnitKeys = monthOutputs.flatMap((output) =>
      output.workUnits.map((unit) => unit.unitKey)
    );

    expect(allUnitKeys).toHaveLength(constrainedStartGoal.target_count ?? 0);
    expect(new Set(allUnitKeys).size).toBe(constrainedStartGoal.target_count);
    expect(monthOutputs[0].workUnits.length).toBe(12);
    expect(monthOutputs[1].workUnits.length).toBe(28);
    expect(monthOutputs[2].workUnits.length).toBe(20);
  });

  it("excludes either side of a current goal link", () => {
    const output = runPlannerKernel(
      input({
        links: [{ sourceGoalId: "goal-a", targetGoalId: "goal-b" }],
      })
    );

    expect(output.eligibility[0]).toMatchObject({
      eligible: false,
      reason: "linked",
    });
    expect(output.workUnits).toEqual([]);
  });

  it("holds replacement when ordered locks conflict", () => {
    const output = runPlannerKernel(
      input({
        goals: [goal({ target_count: 2 })],
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: [
            {
              goalId: "goal-a",
              requirementFingerprint: computeRequirementFingerprint(
                goal({ target_count: 2 })
              ),
              unitKey: "total:1",
              scheduledDate: "2026-08-10",
              locked: true,
            },
            {
              goalId: "goal-a",
              requirementFingerprint: computeRequirementFingerprint(
                goal({ target_count: 2 })
              ),
              unitKey: "total:2",
              scheduledDate: "2026-08-05",
              locked: true,
            },
          ],
        },
      })
    );

    expect(output.solver.issueCodes).toEqual(["invalid_lock"]);
    expect(output.solver.publishable).toBe(false);
    expect(output.validation.valid).toBe(false);
    expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
      "2026-08-10",
      "2026-08-05",
    ]);
    expect(output.diff.some((entry) => entry.kind === "moved")).toBe(false);
    expect(output.suggestedRelaxations).toContain(
      "Unlock the conflicting item before regenerating."
    );
  });

  it("emits a usable unaffected-goal diff beside an invalid lock", () => {
    const invalidGoal = goal({ target_count: 2 });
    const unaffectedGoal = goal({ id: "goal-b", target_count: 1 });
    const invalidFingerprint =
      computeRequirementFingerprint(invalidGoal);
    const output = runPlannerKernel(
      input({
        goals: [invalidGoal, unaffectedGoal],
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: [
            {
              goalId: invalidGoal.id,
              requirementFingerprint: invalidFingerprint,
              unitKey: "total:1",
              scheduledDate: "2026-08-10",
              locked: true,
            },
            {
              goalId: invalidGoal.id,
              requirementFingerprint: invalidFingerprint,
              unitKey: "total:2",
              scheduledDate: "2026-08-05",
              locked: true,
            },
          ],
        },
      })
    );

    expect(output.solver.searchStatus).toBe("blocked_invalid_lock");
    expect(output.solver.invalidGoalIds).toEqual(["goal-a"]);
    expect(
      output.workUnits.find(
        (unit) => unit.originalGoalId === "goal-b"
      )?.scheduledDate
    ).not.toBeNull();
    expect(
      output.diff.some(
        (entry) => entry.kind === "added" && entry.goalId === "goal-b"
      )
    ).toBe(true);
  });

  it("reserves fulfilled scheduled dates during open-unit placement", () => {
    const shortGoal = goal({ target_count: 2, end_date: "2026-08-06" });
    const fingerprint = computeRequirementFingerprint(shortGoal);
    const fact: Completion = {
      id: "completion-a",
      goal_id: shortGoal.id,
      user_id: shortGoal.owner_id,
      completed_on: "2026-08-05",
      source: "manual",
      created_at: "2026-08-05T12:00:00Z",
    };
    const output = runPlannerKernel(
      input({
        goals: [shortGoal],
        completions: [fact],
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: [
            {
              goalId: shortGoal.id,
              requirementFingerprint: fingerprint,
              unitKey: "total:1",
              scheduledDate: "2026-08-05",
              locked: false,
            },
            {
              goalId: shortGoal.id,
              requirementFingerprint: fingerprint,
              unitKey: "total:2",
              scheduledDate: null,
              locked: false,
            },
          ],
          completionToUnit: {
            [fact.id]: {
              goalId: shortGoal.id,
              requirementFingerprint: fingerprint,
              unitKey: "total:1",
              completedOn: fact.completed_on,
            },
          },
        },
      })
    );

    expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
      "2026-08-05",
      "2026-08-06",
    ]);
    expect(output.validation.valid).toBe(true);
  });

  it("reserves canonical completion dates without a prior schedule", () => {
    const shortGoal = goal({ target_count: 2, end_date: "2026-08-06" });
    const fact: Completion = {
      id: "completion-a",
      goal_id: shortGoal.id,
      user_id: shortGoal.owner_id,
      completed_on: "2026-08-05",
      source: "manual",
      created_at: "2026-08-05T12:00:00Z",
    };
    const output = runPlannerKernel(
      input({
        goals: [shortGoal],
        completions: [fact],
      })
    );

    expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
      null,
      "2026-08-06",
    ]);
    expect(output.validation.valid).toBe(true);
  });

  it("recomputes effective local timestamps after solver date changes", () => {
    const shortGoal = goal({ target_count: 1, end_date: "2026-08-06" });
    const fingerprint = computeRequirementFingerprint(shortGoal);
    const output = runPlannerKernel(
      input({
        goals: [shortGoal],
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: [
            {
              goalId: shortGoal.id,
              requirementFingerprint: fingerprint,
              unitKey: "total:1",
              scheduledDate: "2026-08-10",
              locked: false,
              scheduledTimeOverride: "19:30",
            },
          ],
        },
      })
    );

    expect(output.workUnits).toHaveLength(1);
    const unit = output.workUnits[0];
    expect(unit.scheduledDate).not.toBe("2026-08-10");
    expect(unit.scheduledTimeOverride).toBe("19:30");
    expect(unit.effectiveScheduledAtLocal).toBe(
      unit.scheduledDate ? `${unit.scheduledDate}T19:30:00` : null
    );
  });

  it("does not let an inadmissible future fact create false shortfall", () => {
    const shortGoal = goal({ target_count: 2, end_date: "2026-08-06" });
    const futureFact: Completion = {
      id: "future-completion",
      goal_id: shortGoal.id,
      user_id: shortGoal.owner_id,
      completed_on: "2026-08-06",
      source: "manual",
      created_at: "2026-08-05T12:00:00Z",
    };
    const output = runPlannerKernel(
      input({
        goals: [shortGoal],
        completions: [futureFact],
      })
    );

    expect(output.solver.placementStatus).toBe("complete");
    expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
      "2026-08-05",
      "2026-08-06",
    ]);
    expect(output.driftFacts).toContainEqual({
      completionId: futureFact.id,
      completedOn: futureFact.completed_on,
      driftType: "inadmissible",
    });
  });

  it("keeps daily cadence on a configured rest weekday", () => {
    const policy = createDefaultPlannerPolicy(
      "UTC",
      "2026-08-01T00:00:00Z"
    );
    policy.restWeekdays = [0];
    const dailyGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: null,
      start_date: "2026-08-02",
      end_date: "2026-08-02",
    });
    const output = runPlannerKernel(
      input({
        asOfDate: "2026-08-02",
        goals: [dailyGoal],
        policy,
      })
    );

    expect(output.workUnits).toHaveLength(1);
    expect(output.workUnits[0]).toMatchObject({
      restEligible: false,
      scheduledDate: "2026-08-02",
    });
  });

  it("reports historical obligation classifications as informational issues", () => {
    const historicalTotal = runPlannerKernel(
      input({
        asOfDate: "2026-09-01",
        goals: [goal({ target_count: 1 })],
      })
    );
    expect(historicalTotal.solver.issueCodes).toContain(
      "historical_shortfall"
    );

    const cadenceGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: null,
      start_date: "2026-08-01",
    });
    const cadence = runPlannerKernel(
      input({
        asOfDate: "2026-08-12",
        goals: [cadenceGoal],
      })
    );
    expect(cadence.solver.issueCodes).toContain("historical_miss");
  });

  it("lets an earlier open total roll after a later fulfilled ordinal", () => {
    const rollingGoal = goal({ target_count: 2, end_date: "2026-08-06" });
    const fingerprint = computeRequirementFingerprint(rollingGoal);
    const fact: Completion = {
      id: "completion-a",
      goal_id: rollingGoal.id,
      user_id: rollingGoal.owner_id,
      completed_on: "2026-08-05",
      source: "manual",
      created_at: "2026-08-05T12:00:00Z",
    };
    const output = runPlannerKernel(
      input({
        goals: [rollingGoal],
        completions: [fact],
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: [
            {
              goalId: rollingGoal.id,
              requirementFingerprint: fingerprint,
              unitKey: "total:2",
              scheduledDate: "2026-08-05",
              locked: false,
            },
          ],
          completionToUnit: {},
        },
      })
    );

    expect(
      output.workUnits.map((unit) => [
        unit.unitKey,
        unit.classification,
        unit.scheduledDate,
      ])
    ).toEqual([
      ["total:1", "open", "2026-08-06"],
      ["total:2", "fulfilled", "2026-08-05"],
    ]);
    expect(output.validation.valid).toBe(true);
  });

  it("rejects excessive target counts before allocating work units", () => {
    try {
      runPlannerKernel(input({ goals: [goal({ target_count: 5_001 })] }));
      throw new Error("Expected planner bound rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(PlannerError);
      expect((error as PlannerError).code).toBe("plan_too_large");
      expect((error as PlannerError).httpStatus).toBe(413);
    }
  });

  it("preflights fixed milestone labels before allocation", () => {
    try {
      runPlannerKernel(
        input({
          goals: [
            goal({
              frequency_type: "fixed_milestones",
              recurrence_interval: null,
              target_count: 4_294_967_296,
            }),
          ],
        })
      );
      throw new Error("Expected planner bound rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(PlannerError);
      expect((error as PlannerError).code).toBe("plan_too_large");
    }
  });

  it("rejects a locked base assignment without a date at the contract", () => {
    const currentGoal = goal({ target_count: 1 });
    expect(() =>
      runPlannerKernel(
        input({
          goals: [currentGoal],
          basePlan: {
            planId: "plan-a",
            version: 1,
            assignments: [
              {
                goalId: currentGoal.id,
                requirementFingerprint:
                  computeRequirementFingerprint(currentGoal),
                unitKey: "total:1",
                scheduledDate: null,
                locked: true,
              },
            ],
          },
        })
      )
    ).toThrow(PlannerError);
  });

  it("does not reuse assignments across a material requirement lineage", () => {
    const previousGoal = goal({ target_count: 2 });
    const currentGoal = goal({ target_count: 3 });
    const output = runPlannerKernel(
      input({
        goals: [currentGoal],
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: [
            {
              goalId: previousGoal.id,
              requirementFingerprint:
                computeRequirementFingerprint(previousGoal),
              unitKey: "total:1",
              scheduledDate: "2026-08-10",
              locked: true,
            },
          ],
          completionToUnit: {},
        },
      })
    );

    expect(
      output.diff.some(
        (entry) =>
          entry.kind === "removed" &&
          entry.requirementFingerprint ===
            computeRequirementFingerprint(previousGoal)
      )
    ).toBe(true);
    expect(
      output.diff.some(
        (entry) =>
          entry.kind === "added" &&
          entry.requirementFingerprint ===
            computeRequirementFingerprint(currentGoal)
      )
    ).toBe(true);
  });

  it("surfaces credited-work reassignment from the active credit basis", () => {
    const milestoneGoal = goal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 2,
      milestone_names: ["First", "Second"],
    });
    const fingerprint = computeRequirementFingerprint(milestoneGoal);
    const later: Completion = {
      id: "later",
      goal_id: milestoneGoal.id,
      user_id: milestoneGoal.owner_id,
      completed_on: "2026-08-10",
      source: "manual",
      created_at: "2026-08-10T12:00:00Z",
    };
    const earlier: Completion = {
      ...later,
      id: "earlier",
      completed_on: "2026-08-05",
      created_at: "2026-08-05T12:00:00Z",
    };
    const output = runPlannerKernel(
      input({
        asOfDate: "2026-08-20",
        goals: [milestoneGoal],
        completions: [later, earlier],
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: [],
          completionToUnit: {
            later: {
              goalId: milestoneGoal.id,
              requirementFingerprint: fingerprint,
              unitKey: "milestone:1",
              completedOn: later.completed_on,
            },
          },
        },
      })
    );

    expect(output.driftFacts).toContainEqual({
      completionId: "later",
      completedOn: "2026-08-10",
      driftType: "credited_work_reassigned",
    });
  });

  it("surfaces removal of a previously credited completion", () => {
    const currentGoal = goal({ target_count: 1 });
    const fingerprint = computeRequirementFingerprint(currentGoal);
    const output = runPlannerKernel(
      input({
        goals: [currentGoal],
        completions: [],
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: [],
          completionToUnit: {
            removed: {
              goalId: currentGoal.id,
              requirementFingerprint: fingerprint,
              unitKey: "total:1",
              completedOn: "2026-08-04",
            },
          },
        },
      })
    );

    expect(output.driftFacts).toContainEqual({
      completionId: "removed",
      completedOn: "2026-08-04",
      driftType: "credited_work_removed",
    });
  });
});
