import { describe, expect, it } from "vitest";
import type { GoalAssessment } from "@/lib/planner/assessment";
import {
  compilePlannerPolicy,
  createDefaultPlannerPolicy,
} from "@/lib/planner/policy";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";
import { projectWorkUnitsToSolver } from "./project";

function createWorkUnit(
  overrides: Partial<PlannerWorkUnit> = {}
): PlannerWorkUnit {
  return {
    originalGoalId: "goal-a",
    requirementSchemaVersion: "1",
    requirementFingerprint: "req-fp",
    unitKey: "total:1",
    kind: "deadline_total",
    ordinal: 1,
    periodKey: null,
    label: null,
    creditWindow: { start: "2026-08-01", end: "2026-08-31" },
    placementWindow: { start: "2026-08-20", end: "2026-08-31" },
    draftMoveWindow: { start: "2026-08-20", end: "2026-08-31" },
    classification: "open",
    missPolicy: "roll_forward",
    restEligible: true,
    maxPerDay: 1,
    creditedCompletionId: null,
    creditedCompletionDate: null,
    creditState: "uncredited",
    scheduledDate: null,
    locked: false,
    ...overrides,
  };
}

describe("projectWorkUnitsToSolver", () => {
  const compiledPolicy = compilePlannerPolicy(
    createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z")
  );
  const assessments = new Map<string, GoalAssessment>();

  it("keeps policy-conflicting dates in the candidate domain", () => {
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z");
    policy.restWeekdays = [0];
    policy.blackoutRanges = [{ start: "2026-08-03", end: "2026-08-03" }];
    const policyCompiled = compilePlannerPolicy(policy);

    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          placementWindow: { start: "2026-08-02", end: "2026-08-03" },
          draftMoveWindow: { start: "2026-08-02", end: "2026-08-03" },
        }),
      ],
      compiledPolicy: policyCompiled,
      assessments,
    });

    expect(result).toHaveLength(1);
    const [solverUnit] = result;
    expect(solverUnit).toBeDefined();
    if (!solverUnit) {
      throw new Error("Expected one solver unit");
    }
    expect(solverUnit.candidateDates).toEqual(["2026-08-02", "2026-08-03"]);
    expect(solverUnit.dateCosts).toBeDefined();
    if (!solverUnit.dateCosts) {
      throw new Error("Expected date costs");
    }
    expect(solverUnit.dateCosts["2026-08-02"]).toBe(6);
    expect(solverUnit.dateCosts["2026-08-03"]).toBe(10);
  });

  it("skips rest-day penalty for non-rest-eligible units", () => {
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z");
    policy.restWeekdays = [0];
    const policyCompiled = compilePlannerPolicy(policy);

    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          restEligible: false,
          placementWindow: { start: "2026-08-02", end: "2026-08-03" },
          draftMoveWindow: { start: "2026-08-02", end: "2026-08-03" },
        }),
      ],
      compiledPolicy: policyCompiled,
      assessments,
    });

    expect(result).toHaveLength(1);
    const [solverUnit] = result;
    expect(solverUnit).toBeDefined();
    if (!solverUnit) {
      throw new Error("Expected one solver unit");
    }
    expect(solverUnit.dateCosts).toBeDefined();
    if (!solverUnit.dateCosts) {
      throw new Error("Expected date costs");
    }
    expect(solverUnit.dateCosts["2026-08-02"]).toBe(0);
  });

  it("leaves a preserved pre-window assignment out of the solver domain", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          scheduledDate: "2026-08-05",
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
    });

    expect(result).toEqual([]);
  });

  it("reserves that preserved pre-window date against sibling candidates", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          unitKey: "total:1",
          ordinal: 1,
          scheduledDate: "2026-08-05",
        }),
        createWorkUnit({
          unitKey: "total:2",
          ordinal: 2,
          scheduledDate: null,
          placementWindow: { start: "2026-08-05", end: "2026-08-06" },
          draftMoveWindow: { start: "2026-08-05", end: "2026-08-06" },
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.unitKey).toBe("total:2");
    expect(result[0]?.candidateDates).toEqual(["2026-08-06"]);
  });

  it("still projects an in-window preserved assignment as a soft lock", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          scheduledDate: "2026-08-25",
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.lockedDate).toBe("2026-08-25");
    expect(result[0]?.candidateDates).toContain("2026-08-25");
  });

  it("still projects a hard-locked pre-window assignment", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          scheduledDate: "2026-08-05",
          locked: true,
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.lockedDate).toBe("2026-08-05");
    expect(result[0]?.candidateDates).not.toContain("2026-08-05");
  });

  it("still projects a draft-pinned pre-window assignment", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          scheduledDate: "2026-08-05",
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
      draftPinnedDates: { "goal-a:total:1": "2026-08-05" },
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.lockedDate).toBe("2026-08-05");
    expect(result[0]?.candidateDates).not.toContain("2026-08-05");
  });

  it("releases a preserved pre-window assignment when recovering", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          scheduledDate: "2026-08-05",
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
      recoverPastPlacements: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.lockedDate).toBeNull();
    expect(result[0]?.candidateDates).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
    ]);
    // The stale date stops reserving capacity once the unit is back in play.
    expect(result[0]?.candidateDates).not.toContain("2026-08-05");
    expect(result[0]?.previousDate).toBe("2026-08-05");
  });

  it("stops reserving the released date against siblings when recovering", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          unitKey: "total:1",
          ordinal: 1,
          scheduledDate: "2026-08-05",
        }),
        createWorkUnit({
          unitKey: "total:2",
          ordinal: 2,
          scheduledDate: null,
          placementWindow: { start: "2026-08-05", end: "2026-08-06" },
          draftMoveWindow: { start: "2026-08-05", end: "2026-08-06" },
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
      recoverPastPlacements: true,
    });

    expect(result.map((unit) => unit.unitKey)).toEqual(["total:1", "total:2"]);
    expect(result[1]?.candidateDates).toEqual(["2026-08-05", "2026-08-06"]);
  });

  it("leaves a credited pre-window assignment fixed when recovering", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          scheduledDate: "2026-08-05",
          creditState: "completed_as_scheduled",
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
      recoverPastPlacements: true,
    });

    expect(result).toEqual([]);
  });

  it("leaves a locked pre-window assignment hard-locked when recovering", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          scheduledDate: "2026-08-05",
          locked: true,
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
      recoverPastPlacements: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.lockedDate).toBe("2026-08-05");
  });

  it("keeps a draft pin authoritative over recovery", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          scheduledDate: "2026-08-05",
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
      recoverPastPlacements: true,
      draftPinnedDates: { "goal-a:total:1": "2026-08-25" },
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.lockedDate).toBe("2026-08-25");
  });

  it("leaves a lapsed unit with no placement window alone when recovering", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          kind: "cadence",
          unitKey: "cadence:2026-W31",
          periodKey: "2026-W31",
          missPolicy: "remain_missed",
          creditWindow: { start: "2026-07-27", end: "2026-08-02" },
          placementWindow: null,
          draftMoveWindow: null,
          classification: "historical_miss",
          scheduledDate: "2026-08-01",
        }),
      ],
      compiledPolicy,
      assessments,
      preserveExistingAssignments: true,
      recoverPastPlacements: true,
    });

    expect(result).toEqual([]);
  });

  it("does not change projection when recovery is off", () => {
    const workUnits = [createWorkUnit({ scheduledDate: "2026-08-05" })];
    expect(
      projectWorkUnitsToSolver({
        workUnits,
        compiledPolicy,
        assessments,
        preserveExistingAssignments: true,
        recoverPastPlacements: false,
      })
    ).toEqual([]);
  });

  it("projects a valid deterministic ideal date for ordinal work", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          ordinal: 2,
          unitKey: "total:2",
          placementWindow: { start: "2026-08-10", end: "2026-08-20" },
          draftMoveWindow: { start: "2026-08-10", end: "2026-08-31" },
        }),
      ],
      compiledPolicy,
      assessments,
      idealDateContextByGoal: new Map([
        [
          "goal-a",
          {
            targetCount: 3,
            remainingLifetime: {
              start: "2026-08-05",
              end: "2026-08-31",
            },
          },
        ],
      ]),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.idealDate).not.toBeNull();
    expect(result[0]?.candidateDates).toContain(result[0]?.idealDate);
  });

  it("never projects a reserved preferred date as the ideal", () => {
    const result = projectWorkUnitsToSolver({
      workUnits: [
        createWorkUnit({
          placementWindow: { start: "2026-08-16", end: "2026-08-16" },
          draftMoveWindow: { start: "2026-08-16", end: "2026-08-31" },
        }),
      ],
      compiledPolicy,
      assessments,
      completionDatesByGoal: new Map([
        ["goal-a", new Set(["2026-08-16"])],
      ]),
      idealDateContextByGoal: new Map([
        [
          "goal-a",
          {
            targetCount: 1,
            remainingLifetime: {
              start: "2026-08-16",
              end: "2026-08-16",
            },
          },
        ],
      ]),
    });

    expect(result[0]?.candidateDates).not.toContain("2026-08-16");
    expect(result[0]?.idealDate).toBeNull();
  });
});
