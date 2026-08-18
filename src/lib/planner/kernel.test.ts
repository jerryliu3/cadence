import { describe, expect, it } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import {
  runPlannerKernel,
  PlannerError,
  type PlannerKernelInput,
} from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";
import { toKernelWindow } from "@/lib/planner/dates";

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
    team_id: null,
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
    ...toKernelWindow("2026-08"),
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
    expect(first.validation.valid).toBe(true);
  });

  it("solves a multi-month window in one kernel call", () => {
    const cadenceGoal = goal({
      target_count: null,
      start_date: "2026-08-01",
      end_date: "2026-09-30",
    });
    const august = runPlannerKernel(
      input({
        ...toKernelWindow("2026-08"),
        goals: [cadenceGoal],
      })
    );
    const window = runPlannerKernel(
      input({
        startDate: "2026-08-01",
        endDate: "2026-09-30",
        goals: [cadenceGoal],
      })
    );

    expect(window.workUnits.length).toBeGreaterThan(august.workUnits.length);
    expect(
      window.workUnits.some((unit) => unit.unitKey.includes("2026-09"))
    ).toBe(true);
  });

  it("places six milestones proportionally across a two-month lifetime", () => {
    const milestoneGoal = goal({
      id: "goal-milestone",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 6,
      milestone_names: ["One", "Two", "Three", "Four", "Five", "Six"],
      start_date: "2026-08-01",
      end_date: "2026-09-30",
    });
    const output = runPlannerKernel(
      input({
        startDate: "2026-08-01",
        endDate: "2026-09-30",
        asOfDate: "2026-08-01",
        goals: [milestoneGoal],
      })
    );

    expect(
      output.workUnits.map((unit) => unit.scheduledDate?.slice(0, 7))
    ).toEqual([
      "2026-08",
      "2026-08",
      "2026-08",
      "2026-09",
      "2026-09",
      "2026-09",
    ]);
  });

  it("keeps partial-month ordinal ownership identical across monthly and combined runs", () => {
    const partialLifetimeGoal = goal({
      id: "goal-partial-lifetime",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 4,
      milestone_names: ["One", "Two", "Three", "Four"],
      start_date: "2026-08-25",
      end_date: "2026-10-05",
    });
    const combined = runPlannerKernel(
      input({
        startDate: "2026-08-01",
        endDate: "2026-10-31",
        asOfDate: "2026-08-25",
        goals: [partialLifetimeGoal],
      })
    );
    const monthlyUnion = ["2026-08", "2026-09", "2026-10"]
      .flatMap((scopeMonth) =>
        runPlannerKernel(
          input({
            ...toKernelWindow(scopeMonth),
            asOfDate: "2026-08-25",
            goals: [partialLifetimeGoal],
          })
        ).workUnits
      )
      .sort((left, right) => left.ordinal - right.ordinal);

    expect(
      monthlyUnion.map((unit) => [unit.unitKey, unit.scheduledDate])
    ).toEqual(
      combined.workUnits.map((unit) => [unit.unitKey, unit.scheduledDate])
    );
  });

  it("omits projected source-covered ordinals from kernel placement output", () => {
    const milestoneGoal = goal({
      id: "goal-precovered",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 5,
      milestone_names: ["One", "Two", "Three", "Four", "Five"],
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const output = runPlannerKernel(
      input({
        goals: [milestoneGoal],
        precoveredCountByGoalId: {
          [milestoneGoal.id]: 2,
        },
      })
    );

    expect(output.workUnits.map((unit) => unit.unitKey)).toEqual([
      "milestone:3",
      "milestone:4",
      "milestone:5",
    ]);
  });

  it("produces identical assignments for identical fresh runs", () => {
    const runA = runPlannerKernel(input());
    const runB = runPlannerKernel(input());

    expect(runA.solver.assignments).toEqual(runB.solver.assignments);
  });

  it("does not move one goal when another goal is added", () => {
    const firstGoal = goal({ id: "goal-a", target_count: 5 });
    const secondGoal = goal({ id: "goal-b", target_count: 5 });
    const before = runPlannerKernel(input({ goals: [firstGoal] }));
    const after = runPlannerKernel(
      input({ goals: [firstGoal, secondGoal] })
    );
    const firstGoalDatesBefore = before.workUnits
      .filter((unit) => unit.originalGoalId === firstGoal.id)
      .map((unit) => unit.scheduledDate);
    const firstGoalDatesAfterAddingSecondGoal = after.workUnits
      .filter((unit) => unit.originalGoalId === firstGoal.id)
      .map((unit) => unit.scheduledDate);

    expect(firstGoalDatesAfterAddingSecondGoal).toEqual(
      firstGoalDatesBefore
    );
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
          ...toKernelWindow(scopeMonth),
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
        ...toKernelWindow("2026-09"),
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
    expect(summary.windowPlannedCount).toBe(output.workUnits.length);
  });

  it("redistributes elapsed ordinal obligations across remaining lifetime", () => {
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
            ...toKernelWindow(scopeMonth),
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
    expect(monthOutputs[0].workUnits.length).toBeGreaterThan(0);
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
        ...toKernelWindow("2026-08"),
        asOfDate: "2026-08-05",
        goals: [longGoal],
      })
    );
    const completionDates = augustPublished.workUnits
      .map((unit) => unit.scheduledDate)
      .filter((date): date is string => date !== null)
      .slice(0, 2);
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
      completionToUnit: augustPublished.completionToUnit,
      issueCodes: augustPublished.solver.issueCodes,
    };
    const monthOutputs = [
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          ...toKernelWindow("2026-08"),
          asOfDate: "2026-09-10",
          goals: [longGoal],
          completions,
          basePlan: augustBasePlan,
        })
      ),
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          ...toKernelWindow("2026-09"),
          asOfDate: "2026-09-10",
          goals: [longGoal],
          completions,
          basePlan: augustBasePlan,
        })
      ),
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          ...toKernelWindow("2026-10"),
          asOfDate: "2026-09-10",
          goals: [longGoal],
          completions,
          basePlan: augustBasePlan,
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

  it("allocates a persisted uncredited ordinal only to its scheduled month", () => {
    const milestoneGoal = goal({
      id: "goal-milestone",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 6,
      milestone_names: ["One", "Two", "Three", "Four", "Five", "Six"],
      start_date: "2026-08-01",
      end_date: "2026-09-30",
    });
    const output = runPlannerKernel(
      input({
        ...toKernelWindow("2026-08"),
        asOfDate: "2026-08-01",
        goals: [milestoneGoal],
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: [
            {
              goalId: milestoneGoal.id,
              requirementFingerprint:
                computeRequirementFingerprint(milestoneGoal),
              unitKey: "milestone:1",
              scheduledDate: "2026-09-15",
              locked: false,
            },
          ],
        },
      })
    );

    expect(output.workUnits.map((unit) => unit.unitKey)).not.toContain(
      "milestone:1"
    );
    expect(output.horizonSummary[0]?.months).toEqual([
      { month: "2026-08", plannedCount: 2 },
      { month: "2026-09", plannedCount: 4 },
    ]);
  });

  it("uses proportional ownership within a constrained partial first month", () => {
    const constrainedStartGoal = goal({
      target_count: 60,
      start_date: "2026-08-20",
      end_date: "2026-10-31",
    });
    const monthOutputs = ["2026-08", "2026-09", "2026-10"].map((scopeMonth) =>
      runPlannerKernel(
        input({
          eligibilityMode: "overlap_v1",
          ...toKernelWindow(scopeMonth),
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
    expect(monthOutputs.map((output) => output.workUnits.length)).toEqual([
      10, 25, 25,
    ]);
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
        ...toKernelWindow("2026-08"),
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
        ...toKernelWindow("2026-08"),
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
        ...toKernelWindow("2026-08"),
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
          ...toKernelWindow(scopeMonth),
          asOfDate: "2026-08-05",
          goals: [distributedGoal],
          policy,
        })
      )
    );

    expect(monthOutputs.map((output) => output.workUnits.length)).toEqual([3, 4, 5]);
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
        ...toKernelWindow("2026-09"),
        asOfDate: "2026-09-10",
        goals: [distributedGoal],
        policy,
      })
    );
    const october = runPlannerKernel(
      input({
        eligibilityMode: "overlap_v1",
        ...toKernelWindow("2026-10"),
        asOfDate: "2026-09-10",
        goals: [distributedGoal],
        policy,
      })
    );

    expect(september.workUnits.length).toBe(5);
    expect(october.workUnits.length).toBe(7);
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
          ...toKernelWindow(scopeMonth),
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
        ...toKernelWindow("2026-09"),
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
        ...toKernelWindow("2026-09"),
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

  it("keeps unresolved resumed-prefix ordinals in scope after linked suppression resumes", () => {
    const sourceGoal = goal({
      id: "goal-source-resume",
      target_count: 5,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "goal-target-resumed",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 100,
      milestone_names: Array.from({ length: 100 }, (_, index) => `M${index + 1}`),
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const requirementFingerprint = computeRequirementFingerprint(targetGoal);
    const addDays = (startDate: string, days: number) => {
      const date = new Date(`${startDate}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const preservedSuffixAssignments = Array.from({ length: 89 }, (_, index) => {
      const ordinal = index + 12;
      return {
        goalId: targetGoal.id,
        requirementFingerprint,
        unitKey: `milestone:${ordinal}`,
        scheduledDate: addDays("2026-09-01", index),
        locked: false,
      };
    });
    const targetCompletions: Completion[] = [
      "2026-05-24",
      "2026-06-14",
      "2026-06-30",
      "2026-07-27",
      "2026-07-28",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ].map((completedOn, index) => ({
      id: `completion-${index + 1}`,
      goal_id: targetGoal.id,
      user_id: targetGoal.owner_id,
      completed_on: completedOn,
      source: "manual",
      created_at: `${completedOn}T00:00:00.000Z`,
    }));
    const output = runPlannerKernel(
      input({
        startDate: "2026-09-01",
        endDate: "2026-12-31",
        asOfDate: "2026-08-18",
        goals: [targetGoal],
        completions: targetCompletions,
        links: [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }],
        linkSourceGoals: [sourceGoal],
        preserveExistingAssignments: true,
        basePlan: {
          planId: "plan-a",
          version: 1,
          assignments: preservedSuffixAssignments,
          completionToUnit: {},
          issueCodes: [],
        },
      })
    );

    expect(output.workUnits.map((unit) => unit.unitKey)).toEqual(
      expect.arrayContaining(["milestone:9", "milestone:10", "milestone:11"])
    );
    expect(output.solver.issueCodes).toContain("placement_shortfall");
  });

  it("does not enforce resumed omission guard on partial resumed windows", () => {
    const sourceGoal = goal({
      id: "goal-source-partial-window",
      target_count: 5,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "goal-target-partial-window",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 20,
      milestone_names: Array.from({ length: 20 }, (_, index) => `M${index + 1}`),
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });

    expect(() =>
      runPlannerKernel(
        input({
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          asOfDate: "2026-08-18",
          goals: [targetGoal],
          links: [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }],
          linkSourceGoals: [sourceGoal],
          preserveExistingAssignments: true,
        })
      )
    ).not.toThrow();
  });

  it("honors locks that invert ordinal order", () => {
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

    // Ordinal is identity, not sequence: total:1 may legitimately sit after
    // total:2.
    expect(output.solver.issueCodes).toEqual([]);
    expect(output.solver.publishable).toBe(true);
    expect(output.validation.valid).toBe(true);
    expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
      "2026-08-10",
      "2026-08-05",
    ]);
    expect(output.diff.some((entry) => entry.kind === "moved")).toBe(false);
  });

  describe("preserve-mode past placements when asOfDate advances", () => {
    it("keeps a preserved assignment before the placement window without invalid_lock", () => {
      const currentGoal = goal({
        target_count: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-31",
      });
      const output = runPlannerKernel(
        input({
          ...toKernelWindow("2026-08"),
          asOfDate: "2026-08-20",
          goals: [currentGoal],
          preserveExistingAssignments: true,
          basePlan: {
            planId: "plan-a",
            version: 1,
            assignments: [
              {
                goalId: currentGoal.id,
                requirementFingerprint:
                  computeRequirementFingerprint(currentGoal),
                unitKey: "total:1",
                scheduledDate: "2026-08-05",
                locked: false,
              },
            ],
          },
        })
      );

      expect(output.solver.issueCodes).not.toContain("invalid_lock");
      expect(output.solver.publishable).toBe(true);
      expect(output.validation.valid).toBe(true);
      expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
        "2026-08-05",
      ]);
    });

    it("re-places that past assignment when preserve mode is off", () => {
      const currentGoal = goal({
        target_count: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-31",
      });
      const output = runPlannerKernel(
        input({
          ...toKernelWindow("2026-08"),
          asOfDate: "2026-08-20",
          goals: [currentGoal],
          preserveExistingAssignments: false,
          basePlan: {
            planId: "plan-a",
            version: 1,
            assignments: [
              {
                goalId: currentGoal.id,
                requirementFingerprint:
                  computeRequirementFingerprint(currentGoal),
                unitKey: "total:1",
                scheduledDate: "2026-08-05",
                locked: false,
              },
            ],
          },
        })
      );

      expect(output.solver.issueCodes).not.toContain("invalid_lock");
      expect(output.validation.valid).toBe(true);
      expect(output.workUnits[0]?.scheduledDate).not.toBe("2026-08-05");
      expect(output.workUnits[0]?.scheduledDate).not.toBeNull();
      expect(output.workUnits[0]!.scheduledDate! >= "2026-08-20").toBe(true);
    });

    it("keeps a past preserved unit while still placing a later sibling", () => {
      const currentGoal = goal({
        target_count: 2,
        start_date: "2026-08-01",
        end_date: "2026-08-31",
      });
      const fingerprint = computeRequirementFingerprint(currentGoal);
      const output = runPlannerKernel(
        input({
          ...toKernelWindow("2026-08"),
          asOfDate: "2026-08-20",
          goals: [currentGoal],
          preserveExistingAssignments: true,
          basePlan: {
            planId: "plan-a",
            version: 1,
            assignments: [
              {
                goalId: currentGoal.id,
                requirementFingerprint: fingerprint,
                unitKey: "total:1",
                scheduledDate: "2026-08-05",
                locked: false,
              },
              {
                goalId: currentGoal.id,
                requirementFingerprint: fingerprint,
                unitKey: "total:2",
                scheduledDate: "2026-08-25",
                locked: false,
              },
            ],
          },
        })
      );

      expect(output.solver.issueCodes).toEqual([]);
      expect(output.validation.valid).toBe(true);
      expect(
        output.workUnits.map((unit) => [unit.unitKey, unit.scheduledDate])
      ).toEqual([
        ["total:1", "2026-08-05"],
        ["total:2", "2026-08-25"],
      ]);
    });

    it("still soft-locks preserved dates that remain inside the window", () => {
      const currentGoal = goal({
        target_count: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-31",
      });
      const output = runPlannerKernel(
        input({
          ...toKernelWindow("2026-08"),
          asOfDate: "2026-08-20",
          goals: [currentGoal],
          preserveExistingAssignments: true,
          basePlan: {
            planId: "plan-a",
            version: 1,
            assignments: [
              {
                goalId: currentGoal.id,
                requirementFingerprint:
                  computeRequirementFingerprint(currentGoal),
                unitKey: "total:1",
                scheduledDate: "2026-08-25",
                locked: false,
              },
            ],
          },
        })
      );

      expect(output.solver.issueCodes).toEqual([]);
      expect(output.validation.valid).toBe(true);
      expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
        "2026-08-25",
      ]);
      expect(output.diff.some((entry) => entry.kind === "moved")).toBe(false);
    });

    it("still reports invalid_lock for a hard lock before the placement window", () => {
      const currentGoal = goal({
        target_count: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-31",
      });
      const output = runPlannerKernel(
        input({
          ...toKernelWindow("2026-08"),
          asOfDate: "2026-08-20",
          goals: [currentGoal],
          preserveExistingAssignments: true,
          basePlan: {
            planId: "plan-a",
            version: 1,
            assignments: [
              {
                goalId: currentGoal.id,
                requirementFingerprint:
                  computeRequirementFingerprint(currentGoal),
                unitKey: "total:1",
                scheduledDate: "2026-08-05",
                locked: true,
              },
            ],
          },
        })
      );

      expect(output.solver.searchStatus).toBe("blocked_invalid_lock");
      expect(output.solver.issueCodes).toContain("invalid_lock");
      expect(output.solver.invalidGoalIds).toEqual([currentGoal.id]);
      expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
        "2026-08-05",
      ]);
    });

    it("still reports invalid_lock when a draft pin targets a pre-window date", () => {
      const currentGoal = goal({
        target_count: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-31",
      });
      const output = runPlannerKernel(
        input({
          ...toKernelWindow("2026-08"),
          asOfDate: "2026-08-20",
          goals: [currentGoal],
          preserveExistingAssignments: true,
          draftPinnedDates: { "goal-a:total:1": "2026-08-05" },
          basePlan: {
            planId: "plan-a",
            version: 1,
            assignments: [
              {
                goalId: currentGoal.id,
                requirementFingerprint:
                  computeRequirementFingerprint(currentGoal),
                unitKey: "total:1",
                scheduledDate: "2026-08-05",
                locked: false,
              },
            ],
          },
        })
      );

      expect(output.solver.searchStatus).toBe("blocked_invalid_lock");
      expect(output.solver.issueCodes).toContain("invalid_lock");
    });

    it("honors a draft pin that moves a past preserved unit into the window", () => {
      const currentGoal = goal({
        target_count: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-31",
      });
      const output = runPlannerKernel(
        input({
          ...toKernelWindow("2026-08"),
          asOfDate: "2026-08-20",
          goals: [currentGoal],
          preserveExistingAssignments: true,
          draftPinnedDates: { "goal-a:total:1": "2026-08-22" },
          basePlan: {
            planId: "plan-a",
            version: 1,
            assignments: [
              {
                goalId: currentGoal.id,
                requirementFingerprint:
                  computeRequirementFingerprint(currentGoal),
                unitKey: "total:1",
                scheduledDate: "2026-08-05",
                locked: false,
              },
            ],
          },
        })
      );

      expect(output.solver.issueCodes).toEqual([]);
      expect(output.validation.valid).toBe(true);
      expect(output.workUnits.map((unit) => unit.scheduledDate)).toEqual([
        "2026-08-22",
      ]);
    });
  });

  it("emits a usable unaffected-goal diff beside a colliding lock", () => {
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
              scheduledDate: "2026-08-10",
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

describe("solve intent and draft pins", () => {
  it("keeps stable solves anchored to existing placement", () => {
    const stable = runPlannerKernel(input());

    expect(stable.solver.placementStatus).toBe("complete");
    expect(stable.workUnits.map((unit) => unit.scheduledDate)).toEqual([
      "2026-08-08",
      "2026-08-17",
      "2026-08-26",
    ]);
  });

  it("moves only the pinned unit and leaves the rest alone", () => {
    const before = runPlannerKernel(input());
    const pinned = runPlannerKernel(
      input({ draftPinnedDates: { "goal-a:total:1": "2026-08-20" } })
    );
    const beforeByKey = new Map(
      before.workUnits.map((unit) => [unit.unitKey, unit.scheduledDate])
    );
    const moved = pinned.workUnits.filter(
      (unit) => beforeByKey.get(unit.unitKey) !== unit.scheduledDate
    );

    expect(pinned.solver.placementStatus).toBe("complete");
    expect(moved.map((unit) => unit.unitKey)).toEqual(["total:1"]);
    expect(moved[0].scheduledDate).toBe("2026-08-20");
  });

  it("hashes pins, intent, and preserve mode as solver inputs", () => {
    const base = runPlannerKernel(input()).generationInputHash;

    expect(
      runPlannerKernel(input({ solveIntent: "replan" })).generationInputHash
    ).not.toBe(base);
    expect(
      runPlannerKernel(input({ preserveExistingAssignments: true }))
        .generationInputHash
    ).not.toBe(base);
    expect(
      runPlannerKernel(
        input({ draftPinnedDates: { "goal-a:total:1": "2026-08-20" } })
      ).generationInputHash
    ).not.toBe(base);
    expect(
      runPlannerKernel(
        input({ precoveredCountByGoalId: { "goal-a": 2 } })
      ).generationInputHash
    ).not.toBe(base);
  });
});
