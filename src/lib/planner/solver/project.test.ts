import { describe, expect, it } from "vitest";
import type { GoalAssessment } from "@/lib/planner/assessment";
import { compilePlannerPolicy, createDefaultPlannerPolicy } from "@/lib/planner/policy";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";
import { projectWorkUnitsToSolver } from "./project";

function createWorkUnit({
  restEligible = true,
  scheduledDate = null,
  locked = false,
}: {
  restEligible?: boolean;
  scheduledDate?: string | null;
  locked?: boolean;
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
    scheduledDate,
    locked,
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

  it("preserves previousDate under replan projection", () => {
    const compiledPolicy = compilePlannerPolicy(
      createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z")
    );
    const result = projectWorkUnitsToSolver({
      workUnits: [createWorkUnit({ scheduledDate: "2026-08-02" })],
      compiledPolicy,
      assessments: new Map<string, GoalAssessment>(),
    });

    expect(result).toHaveLength(1);
    const [solverUnit] = result;
    expect(solverUnit?.previousDate).toBe("2026-08-02");
    expect(solverUnit?.lockedDate).toBeNull();
  });

  it("only locks assignments that are explicitly locked", () => {
    const compiledPolicy = compilePlannerPolicy(
      createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z")
    );
    const unlocked = projectWorkUnitsToSolver({
      workUnits: [createWorkUnit({ scheduledDate: "2026-08-02", locked: false })],
      compiledPolicy,
      assessments: new Map<string, GoalAssessment>(),
    });
    const locked = projectWorkUnitsToSolver({
      workUnits: [createWorkUnit({ scheduledDate: "2026-08-02", locked: true })],
      compiledPolicy,
      assessments: new Map<string, GoalAssessment>(),
    });

    expect(unlocked[0]?.lockedDate).toBeNull();
    expect(locked[0]?.lockedDate).toBe("2026-08-02");
  });
});
