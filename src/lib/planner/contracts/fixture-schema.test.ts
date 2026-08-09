import { describe, expect, it } from "vitest";
import {
  MAX_WORK_UNITS,
  getSoftRefinementOperationBudget,
} from "./bounds";
import { plannerContractFixtureSchema } from "./fixture-schema";
import completionDispatch from "../../../../test/fixtures/planner-contracts/completion-dispatch.v1.json";
import eligibility from "../../../../test/fixtures/planner-contracts/eligibility.v1.json";
import lifecycleOutcome from "../../../../test/fixtures/planner-contracts/lifecycle-outcome.v1.json";
import solver from "../../../../test/fixtures/planner-contracts/solver.v1.json";

describe("planner contract fixtures", () => {
  const fixtures = [
    lifecycleOutcome,
    completionDispatch,
    eligibility,
    solver,
  ].map((fixture) => plannerContractFixtureSchema.parse(fixture));

  it("loads every frozen contract exactly once with unique case ids", () => {
    expect(fixtures).toHaveLength(4);
    expect(new Set(fixtures.map((fixture) => fixture.contract)).size).toBe(
      fixtures.length
    );

    for (const fixture of fixtures) {
      const ids = fixture.cases.map((fixtureCase) => fixtureCase.id);
      expect(new Set(ids).size, `${fixture.contract} case ids`).toBe(ids.length);
    }
  });

  it("freezes lifecycle and outcome as independent dimensions", () => {
    const fixture = fixtures.find(
      (candidate) => candidate.contract === "lifecycle_outcome"
    );
    expect(fixture?.contract).toBe("lifecycle_outcome");
    if (!fixture || fixture.contract !== "lifecycle_outcome") {
      return;
    }

    const archived = fixture.cases.find(
      (fixtureCase) => fixtureCase.id === "archived_preserves_in_progress_outcome"
    );
    const deadlineDay = fixture.cases.find(
      (fixtureCase) => fixtureCase.id === "deadline_day_is_inclusive"
    );
    const lateFact = fixture.cases.find(
      (fixtureCase) => fixtureCase.id === "late_fact_does_not_rewrite_outcome"
    );

    expect(archived?.expected).toMatchObject({
      lifecycle: "archived",
      outcome: "in_progress",
      calendarEligible: false,
    });
    expect(deadlineDay?.expected.lifecycle).toBe("active");
    expect(lateFact?.expected.outcome).toBe("ended_with_shortfall");
  });

  it("freezes overlap eligibility and outgoing-share behavior", () => {
    const fixture = fixtures.find(
      (candidate) => candidate.contract === "eligibility"
    );
    expect(fixture?.contract).toBe("eligibility");
    if (!fixture || fixture.contract !== "eligibility") {
      return;
    }

    expect(
      fixture.cases.find(
        (fixtureCase) => fixtureCase.id === "outgoing_share_does_not_exclude"
      )?.expected
    ).toEqual({ eligible: true, reason: "eligible" });
    expect(
      fixture.cases.find(
        (fixtureCase) => fixtureCase.id === "linked_target_goal"
      )?.expected.reason
    ).toBe("linked");
    expect(
      fixture.cases.find(
        (fixtureCase) => fixtureCase.id === "deadline_after_scope"
      )?.expected.reason
    ).toBe("eligible");
  });

  it("never dispatches targeted totals to legacy period unmarking", () => {
    const fixture = fixtures.find(
      (candidate) => candidate.contract === "completion_dispatch"
    );
    expect(fixture?.contract).toBe("completion_dispatch");
    if (!fixture || fixture.contract !== "completion_dispatch") {
      return;
    }

    const targetedCases = fixture.cases.filter(
      (fixtureCase) => fixtureCase.input.targetedRecurring
    );
    expect(targetedCases).not.toHaveLength(0);
    expect(
      targetedCases.every(
        (fixtureCase) => fixtureCase.expected.route !== "legacy_period"
      )
    ).toBe(true);

    const repairCase = fixture.cases.find(
      (fixtureCase) => fixtureCase.id === "targeted_total_future_repair"
    );
    expect(repairCase?.expected).toMatchObject({
      route: "canonical_exact_date",
      allowed: true,
      exactDateOnly: true,
    });
  });

  it("keeps frozen solver outputs internally hard-feasible", () => {
    const fixture = fixtures.find(
      (candidate) => candidate.contract === "solver"
    );
    expect(fixture?.contract).toBe("solver");
    if (!fixture || fixture.contract !== "solver") {
      return;
    }

    for (const fixtureCase of fixture.cases) {
      expect(fixtureCase.expected.assignments).toHaveLength(
        fixtureCase.units.length
      );

      const units = new Map(
        fixtureCase.units.map((unit) => [
          `${unit.goalId}\u0000${unit.unitKey}`,
          unit,
        ])
      );
      const datesByGoal = new Map<string, string[]>();

      for (const assignment of fixtureCase.expected.assignments) {
        const unit = units.get(
          `${assignment.goalId}\u0000${assignment.unitKey}`
        );
        expect(unit, `${fixtureCase.id}:${assignment.unitKey}`).toBeDefined();
        if (!unit || assignment.scheduledDate === null) {
          continue;
        }

        expect(unit.candidateDates).toContain(assignment.scheduledDate);
        const dates = datesByGoal.get(unit.goalId) ?? [];
        dates.push(assignment.scheduledDate);
        datesByGoal.set(unit.goalId, dates);
      }

      for (const [goalId, dates] of datesByGoal) {
        expect(new Set(dates).size, `${fixtureCase.id}:${goalId}`).toBe(
          dates.length
        );
      }

      const hasShortfall = fixtureCase.expected.assignments.some(
        (assignment) => assignment.scheduledDate === null
      );
      expect(fixtureCase.expected.placementStatus).toBe(
        hasShortfall ? "partial" : "complete"
      );
      if (fixtureCase.expected.searchStatus === "maximum_partial") {
        expect(hasShortfall).toBe(true);
      }
    }
  });

});

describe("planner bounds contract", () => {
  it("caps deterministic soft refinement operations", () => {
    expect(getSoftRefinementOperationBudget(0)).toBe(500);
    expect(getSoftRefinementOperationBudget(100)).toBe(2_500);
    expect(getSoftRefinementOperationBudget(MAX_WORK_UNITS)).toBe(25_000);
    expect(() => getSoftRefinementOperationBudget(-1)).toThrow(RangeError);
  });
});
