import type {
  PlannerSolverResult,
  SolverUnit,
} from "@/lib/planner/solver/types";
import { getSolverUnitId } from "@/lib/planner/solver/types";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";
import { compareDateStrings } from "@/lib/goals/periods";
import { dateIsInWindow } from "@/lib/planner/dates";

export interface SolverValidationResult {
  valid: boolean;
  invariantViolations: string[];
}

export function validateSolverResult(
  units: SolverUnit[],
  result: PlannerSolverResult
): SolverValidationResult {
  const violations = new Set<string>();
  const unitByKey = new Map(
    units.map((unit) => [getSolverUnitId(unit), unit])
  );
  const assignmentByKey = new Map<string, string | null>();

  if (result.assignments.length !== units.length) {
    violations.add("incomplete_assignment_set");
  }
  for (const assignment of result.assignments) {
    const unitId = getSolverUnitId(assignment);
    if (assignmentByKey.has(unitId)) {
      violations.add("duplicate_assignment");
    }
    assignmentByKey.set(unitId, assignment.scheduledDate);
    const unit = unitByKey.get(unitId);
    if (!unit) {
      violations.add("unknown_unit");
      continue;
    }
    if (
      assignment.scheduledDate !== null &&
      !unit.candidateDates.includes(assignment.scheduledDate)
    ) {
      violations.add("date_outside_domain");
    }
    if (
      unit.lockedDate !== null &&
      assignment.scheduledDate !== unit.lockedDate
    ) {
      violations.add("lock_not_preserved");
    }
  }

  const byGoal = new Map<string, SolverUnit[]>();
  for (const unit of units) {
    if (!assignmentByKey.has(getSolverUnitId(unit))) {
      violations.add("missing_unit");
    }
    const existing = byGoal.get(unit.goalId) ?? [];
    existing.push(unit);
    byGoal.set(unit.goalId, existing);
  }
  // Ordinal no longer constrains scheduling, so neither date order nor a
  // contiguous placed prefix is an invariant. One unit per goal per date still
  // is.
  for (const goalUnits of byGoal.values()) {
    const usedDates = new Set<string>();
    for (const unit of goalUnits) {
      const date = assignmentByKey.get(getSolverUnitId(unit)) ?? null;
      if (date === null) {
        continue;
      }
      if (usedDates.has(date)) {
        violations.add("duplicate_goal_date");
      }
      usedDates.add(date);
    }
  }

  const placedCount = result.assignments.filter(
    (assignment) => assignment.scheduledDate !== null
  ).length;
  const complete = placedCount === units.length;
  if (
    result.placementStatus !== (complete ? "complete" : "partial")
  ) {
    violations.add("placement_status_mismatch");
  }
  if (
    !complete &&
    !result.issueCodes.includes("placement_shortfall") &&
    !result.issueCodes.includes("invalid_lock")
  ) {
    violations.add("missing_shortfall_issue");
  }
  if (
    result.issueCodes.includes("invalid_lock") &&
    result.publishable
  ) {
    violations.add("invalid_lock_publishable");
  }
  if (
    result.invalidGoalIds.length > 0 &&
    result.searchStatus !== "blocked_invalid_lock"
  ) {
    violations.add("invalid_lock_status_mismatch");
  }
  if (
    result.searchStatus === "blocked_invalid_lock" &&
    (result.invalidGoalIds.length === 0 ||
      !result.issueCodes.includes("invalid_lock"))
  ) {
    violations.add("blocked_status_without_invalid_goal");
  }
  if (
    result.confirmationRequired &&
    result.placementStatus !== "partial"
  ) {
    violations.add("unexpected_confirmation");
  }

  return {
    valid: violations.size === 0,
    invariantViolations: Array.from(violations).sort(),
  };
}

export function validateMergedWorkUnitAssignments(
  workUnits: PlannerWorkUnit[]
): SolverValidationResult {
  const violations = new Set<string>();
  const identities = new Set<string>();
  const datesByGoal = new Map<string, Set<string>>();

  for (const unit of workUnits) {
    const identity = `${unit.originalGoalId}\u0000${unit.requirementFingerprint}\u0000${unit.unitKey}`;
    if (identities.has(identity)) {
      violations.add("duplicate_work_unit_identity");
    }
    identities.add(identity);
    if (unit.scheduledDate === null) {
      continue;
    }
    const usedDates =
      datesByGoal.get(unit.originalGoalId) ?? new Set<string>();
    if (usedDates.has(unit.scheduledDate)) {
      violations.add("duplicate_goal_date");
    }
    usedDates.add(unit.scheduledDate);
    datesByGoal.set(unit.originalGoalId, usedDates);

    if (
      (unit.classification === "open" ||
        unit.classification === "future") &&
      (!unit.placementWindow ||
        !dateIsInWindow(unit.scheduledDate, unit.placementWindow))
    ) {
      // Dates before the active window are retained past placements (asOfDate
      // moved forward), not newly assigned out-of-window dates.
      const retainedBeforeWindow =
        unit.placementWindow !== null &&
        compareDateStrings(unit.scheduledDate, unit.placementWindow.start) < 0;
      if (!retainedBeforeWindow) {
        violations.add("date_outside_placement_window");
      }
    }
  }

  return {
    valid: violations.size === 0,
    invariantViolations: Array.from(violations).sort(),
  };
}
