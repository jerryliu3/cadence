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
});
