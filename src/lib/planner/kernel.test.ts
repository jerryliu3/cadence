import { describe, expect, it } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import {
  runPlannerKernel,
  PlannerError,
  type PlannerKernelInput,
} from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";

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
    eligibilityMode: "overlap_v1",
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
  it("runs the overlap pipeline deterministically", () => {
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

  it("emits horizon summary using the same ordinal partition source", () => {
    const longGoal = goal({
      target_count: 9,
      start_date: "2026-08-01",
      end_date: "2026-10-31",
    });
    const output = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        scopeMonth: "2026-09",
        asOfDate: "2026-08-05",
        goals: [longGoal],
      })
    );

    expect(output.horizonSummary).toHaveLength(1);
    const summary = output.horizonSummary[0];
    expect(summary.goalId).toBe(longGoal.id);
    expect(summary.totalCount).toBe(longGoal.target_count);
    expect(
      summary.months.reduce((count, month) => count + month.plannedCount, 0)
    ).toBe(longGoal.target_count);
    expect(summary.scopeMonthPlannedCount).toBe(output.workUnits.length);
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

  it("keeps ordinal partitions stable when one month is regenerated from a published base plan", () => {
    const longGoal = goal({
      target_count: 12,
      start_date: "2026-08-01",
      end_date: "2026-10-31",
    });
    const augustPublished = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        scopeMonth: "2026-08",
        asOfDate: "2026-08-05",
        goals: [longGoal],
      })
    );
    const completionDates = augustPublished.workUnits
      .map((unit) => unit.scheduledDate)
      .filter((date): date is string => date !== null)
      .slice(2, 4);
    expect(completionDates).toHaveLength(2);
    const completions: Completion[] = completionDates.map((date, index) => ({
      id: `published-c${index + 1}`,
      goal_id: longGoal.id,
      user_id: longGoal.owner_id,
      completed_on: date,
      source: "manual",
      created_at: `${date}T12:00:00Z`,
    }));
    const augustBasePlan = {
      planId: "plan-aug-1",
      version: 1,
      assignments: augustPublished.workUnits.map((unit) => ({
        goalId: unit.originalGoalId,
        requirementFingerprint: unit.requirementFingerprint,
        unitKey: unit.unitKey,
        scheduledDate: unit.scheduledDate,
        locked: unit.locked,
      })),
      completionToUnit: Object.fromEntries(
        augustPublished.workUnits.flatMap((unit) =>
          unit.creditedCompletionId && unit.creditedCompletionDate
            ? [
                [
                  unit.creditedCompletionId,
                  {
                    goalId: unit.originalGoalId,
                    requirementFingerprint: unit.requirementFingerprint,
                    unitKey: unit.unitKey,
                    completedOn: unit.creditedCompletionDate,
                  },
                ] as const,
              ]
            : []
        )
      ),
      issueCodes: augustPublished.solver.issueCodes,
    };
    const monthOutputs = [
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          scopeMonth: "2026-08",
          asOfDate: "2026-09-10",
          goals: [longGoal],
          completions,
          basePlan: augustBasePlan,
        })
      ),
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          scopeMonth: "2026-09",
          asOfDate: "2026-09-10",
          goals: [longGoal],
          completions,
          basePlan: null,
        })
      ),
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          scopeMonth: "2026-10",
          asOfDate: "2026-09-10",
          goals: [longGoal],
          completions,
          basePlan: null,
        })
      ),
    ];
    const allUnitKeys = monthOutputs.flatMap((output) =>
      output.workUnits.map((unit) => unit.unitKey)
    );
    const expectedUnitKeys = Array.from(
      { length: longGoal.target_count ?? 0 },
      (_, index) => `total:${index + 1}`
    );

    expect(allUnitKeys).toHaveLength(longGoal.target_count ?? 0);
    expect(new Set(allUnitKeys).size).toBe(longGoal.target_count);
    expect(new Set(allUnitKeys)).toEqual(new Set(expectedUnitKeys));
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

  it("marks ordinal goals with oversized horizons as ineligible", () => {
    const oversizedHorizonGoal = goal({
      target_count: 48,
      start_date: "2026-01-01",
      end_date: "2028-12-31",
    });
    const output = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        scopeMonth: "2026-08",
        asOfDate: "2026-08-05",
        goals: [oversizedHorizonGoal],
      })
    );

    expect(output.eligibility).toContainEqual({
      goalId: oversizedHorizonGoal.id,
      eligible: false,
      reason: "horizon_too_long",
    });
    expect(output.workUnits).toHaveLength(0);
  });

  it("marks cadence goals with oversized bounded horizons as ineligible", () => {
    const oversizedCadenceGoal = goal({
      id: "goal-cadence-overlong",
      recurrence_interval: "weekly",
      target_count: null,
      start_date: "2026-01-01",
      end_date: "2028-12-31",
    });
    const output = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        scopeMonth: "2026-08",
        asOfDate: "2026-08-05",
        goals: [oversizedCadenceGoal],
      })
    );

    expect(output.eligibility).toContainEqual({
      goalId: oversizedCadenceGoal.id,
      eligible: false,
      reason: "horizon_too_long",
    });
    expect(output.workUnits).toHaveLength(0);
  });

  it("supports open-ended cadence goals without synthetic horizons", () => {
    const openCadenceGoal = goal({
      id: "goal-cadence-open-ended",
      recurrence_interval: "weekly",
      target_count: null,
      start_date: "2026-07-15",
      end_date: null,
    });
    const output = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        scopeMonth: "2026-08",
        asOfDate: "2026-08-05",
        goals: [openCadenceGoal],
      })
    );

    expect(output.eligibility).toContainEqual({
      goalId: openCadenceGoal.id,
      eligible: true,
      reason: "eligible",
    });
    expect(output.workUnits.length).toBeGreaterThan(0);
    expect(output.workUnits.every((unit) => unit.kind === "cadence")).toBe(true);
    expect(output.horizonSummary).toEqual([]);
  });

  it("ignores legacy monthly distribution hints and partitions ordinals deterministically", () => {
    const distributedGoal = goal({
      target_count: 12,
      start_date: "2026-08-01",
      end_date: "2026-10-31",
    });
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z");
    const monthOutputs = ["2026-08", "2026-09", "2026-10"].map((scopeMonth) =>
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          scopeMonth,
          asOfDate: "2026-08-05",
          goals: [distributedGoal],
          policy,
        })
      )
    );

    expect(monthOutputs.map((output) => output.workUnits.length)).toEqual([4, 4, 4]);
    const unitKeys = monthOutputs.flatMap((output) =>
      output.workUnits.map((unit) => unit.unitKey)
    );
    expect(new Set(unitKeys).size).toBe(distributedGoal.target_count);
  });

  it("carries and spills deterministically when an early month is elapsed", () => {
    const distributedGoal = goal({
      target_count: 12,
      start_date: "2026-08-01",
      end_date: "2026-10-31",
    });
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z");
    const september = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        scopeMonth: "2026-09",
        asOfDate: "2026-09-10",
        goals: [distributedGoal],
        policy,
      })
    );
    const october = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        scopeMonth: "2026-10",
        asOfDate: "2026-09-10",
        goals: [distributedGoal],
        policy,
      })
    );

    expect(september.workUnits.length).toBe(8);
    expect(october.workUnits.length).toBe(4);
    const unitKeys = [...september.workUnits, ...october.workUnits].map(
      (unit) => unit.unitKey
    );
    expect(new Set(unitKeys).size).toBe(distributedGoal.target_count);
  });

  it("keeps distributed ordinal ownership unique with credited completions", () => {
    const distributedGoal = goal({
      target_count: 12,
      start_date: "2026-08-01",
      end_date: "2026-10-31",
    });
    const completions: Completion[] = Array.from({ length: 6 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return {
        id: `completion-${index + 1}`,
        goal_id: distributedGoal.id,
        user_id: distributedGoal.owner_id,
        completed_on: `2026-08-${day}`,
        source: "manual",
        created_at: `2026-08-${day}T00:00:00Z`,
      };
    });
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z");
    const monthOutputs = ["2026-08", "2026-09", "2026-10"].map((scopeMonth) =>
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          scopeMonth,
          asOfDate: "2026-09-10",
          goals: [distributedGoal],
          completions,
          policy,
        })
      )
    );
    const allUnitKeys = monthOutputs.flatMap((output) =>
      output.workUnits.map((unit) => unit.unitKey)
    );

    expect(allUnitKeys).toHaveLength(distributedGoal.target_count ?? 0);
    expect(new Set(allUnitKeys).size).toBe(distributedGoal.target_count);
    expect(new Set(allUnitKeys)).toEqual(
      new Set(
        Array.from({ length: distributedGoal.target_count ?? 0 }, (_, index) =>
          `total:${index + 1}`
        )
      )
    );
  });

  it("does not credit early milestone completions into a later-month slice", () => {
    const milestoneGoal = goal({
      id: "goal-milestone",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 6,
      milestone_names: ["One", "Two", "Three", "Four", "Five", "Six"],
      start_date: "2026-08-01",
      end_date: "2026-09-30",
    });
    const completions: Completion[] = [
      {
        id: "c1",
        goal_id: milestoneGoal.id,
        user_id: milestoneGoal.owner_id,
        completed_on: "2026-08-03",
        source: "manual",
        created_at: "2026-08-03T12:00:00Z",
      },
      {
        id: "c2",
        goal_id: milestoneGoal.id,
        user_id: milestoneGoal.owner_id,
        completed_on: "2026-08-05",
        source: "manual",
        created_at: "2026-08-05T12:00:00Z",
      },
      {
        id: "c3",
        goal_id: milestoneGoal.id,
        user_id: milestoneGoal.owner_id,
        completed_on: "2026-08-07",
        source: "manual",
        created_at: "2026-08-07T12:00:00Z",
      },
    ];
    const output = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        scopeMonth: "2026-09",
        asOfDate: "2026-09-10",
        goals: [milestoneGoal],
        completions,
      })
    );

    expect(output.workUnits.map((unit) => unit.unitKey)).toEqual([
      "milestone:4",
      "milestone:5",
      "milestone:6",
    ]);
    expect(output.workUnits.every((unit) => unit.creditedCompletionId === null)).toBe(
      true
    );
  });

  it("does not credit early deadline completions into a later-month slice", () => {
    const deadlineGoal = goal({
      id: "goal-deadline",
      target_count: 20,
      recurrence_interval: "daily",
      start_date: "2026-08-01",
      end_date: "2026-09-30",
    });
    const completions: Completion[] = Array.from({ length: 10 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return {
        id: `c${index + 1}`,
        goal_id: deadlineGoal.id,
        user_id: deadlineGoal.owner_id,
        completed_on: `2026-08-${day}`,
        source: "manual",
        created_at: `2026-08-${day}T12:00:00Z`,
      };
    });
    const output = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        scopeMonth: "2026-09",
        asOfDate: "2026-09-10",
        goals: [deadlineGoal],
        completions,
      })
    );

    expect(output.workUnits.map((unit) => unit.unitKey)).toEqual([
      "total:11",
      "total:12",
      "total:13",
      "total:14",
      "total:15",
      "total:16",
      "total:17",
      "total:18",
      "total:19",
      "total:20",
    ]);
    expect(output.workUnits.every((unit) => unit.creditedCompletionId === null)).toBe(
      true
    );
  });

  it("keeps linked sources eligible for planning", () => {
    const output = runPlannerKernel(
      input({
        links: [{ sourceGoalId: "goal-a", targetGoalId: "goal-b" }],
      })
    );

    expect(output.eligibility[0]).toMatchObject({
      goalId: "goal-a",
      eligible: true,
      reason: "eligible",
    });
    expect(output.workUnits).toHaveLength(3);
  });

  it("excludes linked targets from planning", () => {
    const sourceGoal = goal({ id: "goal-a", target_count: 2 });
    const targetGoal = goal({ id: "goal-b", target_count: 2 });
    const output = runPlannerKernel(
      input({
        goals: [sourceGoal, targetGoal],
        links: [{ sourceGoalId: "goal-a", targetGoalId: "goal-b" }],
      })
    );

    expect(output.eligibility).toContainEqual({
      goalId: "goal-b",
      eligible: false,
      reason: "linked",
    });
    expect(output.workUnits.every((unit) => unit.originalGoalId !== "goal-b")).toBe(true);
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
    expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
      "2026-08-10",
      "2026-08-05",
    ]);
  });

  it("keeps unaffected-goal scheduling beside an invalid lock", () => {
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
    const currentFingerprint = computeRequirementFingerprint(currentGoal);
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
      output.workUnits.every(
        (workUnit) => workUnit.requirementFingerprint === currentFingerprint
      )
    ).toBe(true);
    expect(output.workUnits.some((workUnit) => workUnit.locked)).toBe(false);
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
