import { describe, expect, it } from "vitest";
import type { GoalAssessment } from "@/lib/planner/assessment";
import { compilePlannerPolicy, createDefaultPlannerPolicy } from "@/lib/planner/policy";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";
import { projectWorkUnitsToSolver } from "./project";

function createWorkUnit({
  restEligible = true,
}: {
  restEligible?: boolean;
} = {}): PlannerWorkUnit {
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
    placementWindow: { start: "2026-08-02", end: "2026-08-03" },
    draftMoveWindow: { start: "2026-08-02", end: "2026-08-03" },
    classification: "open",
    missPolicy: "roll_forward",
    restEligible,
    maxPerDay: 1,
    creditedCompletionId: null,
    creditedCompletionDate: null,
    creditState: "uncredited",
    scheduledDate: null,
    locked: false,
  };
}

describe("projectWorkUnitsToSolver", () => {
  it("keeps policy-conflicting dates in the candidate domain", () => {
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z");
    policy.restWeekdays = [0];
    policy.blackoutRanges = [{ start: "2026-08-03", end: "2026-08-03" }];
    const compiledPolicy = compilePlannerPolicy(policy);

    const result = projectWorkUnitsToSolver({
      workUnits: [createWorkUnit()],
      compiledPolicy,
      assessments: new Map<string, GoalAssessment>(),
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
    const compiledPolicy = compilePlannerPolicy(policy);

    const result = projectWorkUnitsToSolver({
      workUnits: [createWorkUnit({ restEligible: false })],
      compiledPolicy,
      assessments: new Map<string, GoalAssessment>(),
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

  it("pins targeted units to draft move dates before preserve-existing fallback", () => {
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z");
    const compiledPolicy = compilePlannerPolicy(policy);
    const workUnit = createWorkUnit();
    workUnit.scheduledDate = "2026-08-02";

    const result = projectWorkUnitsToSolver({
      workUnits: [workUnit],
      compiledPolicy,
      assessments: new Map<string, GoalAssessment>(),
      preserveExistingAssignments: true,
      draftPinnedDates: {
        "goal-a:total:1": "2026-08-03",
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.lockedDate).toBe("2026-08-03");
  });
});
