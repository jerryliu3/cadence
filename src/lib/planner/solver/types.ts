export type SolverRequirementKind =
  | "milestone_sequence"
  | "cadence"
  | "deadline_total";

export interface SolverUnit {
  unitKey: string;
  goalId: string;
  kind: SolverRequirementKind;
  ordinal: number;
  candidateDates: string[];
  previousDate: string | null;
  lockedDate: string | null;
  dateCosts?: Record<string, number>;
  estimatedMinutes?: number;
}

export interface SolverAssignment {
  goalId: string;
  unitKey: string;
  scheduledDate: string | null;
}

export type PlannerIssueCode =
  | "placement_shortfall"
  | "invalid_lock"
  | "soft_optimization_exhausted"
  | "historical_miss"
  | "historical_shortfall";

export interface PlannerSolverResult {
  assignments: SolverAssignment[];
  placementStatus: "complete" | "partial";
  searchStatus:
    | "all_units_placed"
    | "maximum_partial"
    | "blocked_invalid_lock"
    | "soft_optimization_exhausted";
  capacityStatus: "unverified";
  issueCodes: PlannerIssueCode[];
  invalidGoalIds: string[];
  publishable: boolean;
  confirmationRequired: boolean;
}

export type SolverSolveIntent = "stable" | "replan";

export interface SolverObjective {
  placed: number;
  moved: number;
  displacement: number;
  policyCost: number;
}

export function getSolverUnitId(
  value: Pick<SolverAssignment, "goalId" | "unitKey">
) {
  return `${value.goalId}\u0000${value.unitKey}`;
}
