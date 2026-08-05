import type { Goal } from "@/lib/goals/types";
import { canonicalHash } from "@/lib/planner/canonical";
import type { PlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  ASSESSMENT_SCHEMA_VERSION,
  ELIGIBILITY_MODE,
  PLANNER_CONTRACT_VERSION,
  POLICY_COMPILER_VERSION,
  POLICY_SCHEMA_VERSION,
  REQUIREMENT_SCHEMA_VERSION,
  SCHEDULER_VERSION,
} from "@/lib/planner/contracts/bounds";
import { enumerateDates, getScopeDateRange, getUtcWeekday } from "@/lib/planner/dates";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";
import type { PlannerPolicy } from "@/lib/planner/policy";
import { createDefaultAssessment, type GoalAssessment } from "@/lib/planner/assessment";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";

type PlannerIssueSeverity = "informational" | "warning" | "blocking";

export interface PlannerPublishIntent {
  scopeMonth: string;
  previewHash: string;
  expectedCanonicalRevision: number;
  expectedExecutionRevision: number;
  expectedBasePlanId: string | null;
  expectedBasePlanVersion: number | null;
}

export interface PlannerPublishPersistencePayload {
  generationSource: "manual" | "update";
  changeSummary: Record<string, number | boolean>;
  goals: Array<{
    goal_id: string;
    title: string;
    category: string;
    color: string | null;
    start_date: string;
    end_date: string | null;
    requirement_kind: "milestone_sequence" | "cadence" | "deadline_total";
    requirement_fingerprint: string;
    requirement_snapshot: unknown;
    assessment_snapshot: unknown;
    assessment_input_hash: string;
    admissible_credit_basis: unknown;
    generation_summary: unknown;
  }>;
  days: Array<{
    date: string;
    is_rest_day: boolean;
    is_blocked: boolean;
    preference_cost: number;
    resolved_policy: unknown;
    generation_session_count: number;
    generation_effort_minutes: number;
  }>;
  items: Array<{
    goal_id: string;
    unit_key: string;
    requirement_kind: "milestone_sequence" | "cadence" | "deadline_total";
    ordinal: number;
    period_key: string | null;
    label: string | null;
    credit_window_start: string;
    credit_window_end: string;
    placement_window_start: string | null;
    placement_window_end: string | null;
    classification:
      | "fulfilled"
      | "open"
      | "future"
      | "historical_shortfall"
      | "historical_miss"
      | "satisfied_elsewhere";
    miss_policy: "roll_forward" | "remain_missed";
    rest_eligible: boolean;
    max_per_day: 1;
    credited_completion_id: string | null;
    credited_completion_date: string | null;
    credit_state: "uncredited" | "completed_as_scheduled" | "completed_elsewhere";
    original_scheduled_date: string | null;
    scheduled_date: string | null;
    locked: boolean;
    locked_at: string | null;
    estimated_minutes: number;
    priority: number;
  }>;
  issues: Array<{
    goal_id: string | null;
    issue_code:
      | "placement_shortfall"
      | "invalid_lock"
      | "soft_optimization_exhausted"
      | "historical_miss"
      | "historical_shortfall";
    severity: PlannerIssueSeverity;
    unit_key: string | null;
    details: Record<string, unknown>;
  }>;
}

const issueSeverityByCode: Record<
  PlannerPublishPersistencePayload["issues"][number]["issue_code"],
  PlannerIssueSeverity
> = {
  placement_shortfall: "blocking",
  invalid_lock: "blocking",
  soft_optimization_exhausted: "warning",
  historical_miss: "informational",
  historical_shortfall: "informational",
};

function countByKind(diff: PlannerKernelOutput["diff"], kind: PlannerKernelOutput["diff"][number]["kind"]) {
  return diff.filter((entry) => entry.kind === kind).length;
}

function assessmentForGoal(
  goal: Goal,
  suppliedAssessments: Map<string, GoalAssessment>
) {
  return suppliedAssessments.get(goal.id) ?? createDefaultAssessment(goal);
}

export function buildPlannerPublishRequestDigest({
  ownerId,
  idempotencyKey,
  intent,
}: {
  ownerId: string;
  idempotencyKey: string;
  intent: PlannerPublishIntent;
}) {
  return canonicalHash({
    ownerId,
    idempotencyKey,
    intent,
  });
}

export function buildPlannerConfirmationHash({
  previewHash,
  issueCodes,
}: {
  previewHash: string;
  issueCodes: string[];
}) {
  return canonicalHash({
    previewHash,
    issueCodes: [...issueCodes].sort(),
  });
}

export function buildPlannerPublishPersistencePayload({
  scopeMonth,
  policy,
  kernel,
  snapshot,
  assessments,
}: {
  scopeMonth: string;
  policy: PlannerPolicy;
  kernel: PlannerKernelOutput;
  snapshot: PlannerCanonicalSnapshot;
  assessments: GoalAssessment[];
}): PlannerPublishPersistencePayload {
  const eligibleGoalIds = new Set(
    kernel.eligibility.filter((entry) => entry.eligible).map((entry) => entry.goalId)
  );
  const assessmentByGoalId = new Map(
    assessments.map((assessment) => [assessment.goalId, assessment])
  );
  const goals = snapshot.goals
    .filter((goal) => eligibleGoalIds.has(goal.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  const goalPayload = goals.map((goal) => {
    const normalizedRequirement = normalizeGoalRequirement(goal);
    const assessment = assessmentForGoal(goal, assessmentByGoalId);
    return {
      goal_id: goal.id,
      title: goal.title,
      category: goal.category,
      color: goal.color,
      start_date: goal.start_date,
      end_date: goal.end_date,
      requirement_kind: normalizedRequirement.requirement.kind,
      requirement_fingerprint: normalizedRequirement.requirementFingerprint,
      requirement_snapshot: {
        schemaVersion: REQUIREMENT_SCHEMA_VERSION,
        requirement: normalizedRequirement.requirement,
      },
      assessment_snapshot: assessment,
      assessment_input_hash: assessment.assessmentInputHash,
      admissible_credit_basis: {
        schemaVersion: "1",
        scopeMonth,
        scopeState: kernel.scopeState,
      },
      generation_summary: {
        schemaVersion: "1",
        eligibilityReason:
          kernel.eligibility.find((entry) => entry.goalId === goal.id)?.reason ??
          "eligible",
      },
    };
  });

  const workUnits = [...kernel.workUnits];
  const unitsByDate = new Map<string, typeof workUnits>();
  for (const unit of workUnits) {
    if (!unit.scheduledDate) {
      continue;
    }
    const existing = unitsByDate.get(unit.scheduledDate) ?? [];
    existing.push(unit);
    unitsByDate.set(unit.scheduledDate, existing);
  }

  const days = enumerateDates(getScopeDateRange(scopeMonth)).map((date) => {
    const unitsForDate = unitsByDate.get(date) ?? [];
    const effortMinutes = unitsForDate.reduce((total, unit) => {
      const assessment = assessmentByGoalId.get(unit.originalGoalId);
      return total + (assessment?.estimatedMinutesPerSession ?? 30);
    }, 0);
    const isBlocked = policy.blackoutRanges.some(
      (range) => date >= range.start && date <= range.end
    );
    return {
      date,
      is_rest_day: policy.restWeekdays.includes(getUtcWeekday(date)),
      is_blocked: isBlocked,
      preference_cost: 0,
      resolved_policy: {
        schemaVersion: POLICY_SCHEMA_VERSION,
        timezone: policy.timezone,
      },
      generation_session_count: unitsForDate.length,
      generation_effort_minutes: effortMinutes,
    };
  });

  const items = workUnits.map((unit) => {
    const assessment = assessmentByGoalId.get(unit.originalGoalId);
    return {
      goal_id: unit.originalGoalId,
      unit_key: unit.unitKey,
      requirement_kind: unit.kind,
      ordinal: unit.ordinal,
      period_key: unit.periodKey,
      label: unit.label,
      credit_window_start: unit.creditWindow.start,
      credit_window_end: unit.creditWindow.end,
      placement_window_start: unit.placementWindow?.start ?? null,
      placement_window_end: unit.placementWindow?.end ?? null,
      classification: unit.classification,
      miss_policy: unit.missPolicy,
      rest_eligible: unit.restEligible,
      max_per_day: 1 as const,
      credited_completion_id: unit.creditedCompletionId,
      credited_completion_date: unit.creditedCompletionDate,
      credit_state: unit.creditState,
      original_scheduled_date: unit.scheduledDate,
      scheduled_date: unit.scheduledDate,
      locked: unit.locked,
      locked_at: unit.locked ? new Date().toISOString() : null,
      estimated_minutes: assessment?.estimatedMinutesPerSession ?? 30,
      priority: assessment?.priority ?? 3,
    };
  });

  const issues = kernel.solver.issueCodes.map((issueCode) => ({
    goal_id: null,
    issue_code: issueCode,
    severity: issueSeverityByCode[issueCode],
    unit_key: null,
    details: {},
  }));

  const added = countByKind(kernel.diff, "added");
  const removed = countByKind(kernel.diff, "removed");
  const moved = countByKind(kernel.diff, "moved");
  const lockChanged = countByKind(kernel.diff, "lock_changed");

  return {
    generationSource: snapshot.activePlan ? "update" : "manual",
    changeSummary: {
      added,
      removed,
      moved,
      lockChanged,
      confirmationRequired: kernel.solver.confirmationRequired,
      publishable: kernel.solver.publishable,
    },
    goals: goalPayload,
    days,
    items,
    issues,
  };
}

export function plannerPlanMetadataFromKernel({
  timezone,
  kernel,
}: {
  timezone: string;
  kernel: PlannerKernelOutput;
}) {
  return {
    eligibilityMode: ELIGIBILITY_MODE,
    timezone,
    contractVersion: PLANNER_CONTRACT_VERSION,
    schedulerVersion: SCHEDULER_VERSION,
    requirementSchemaVersion: REQUIREMENT_SCHEMA_VERSION,
    assessmentSchemaVersion: ASSESSMENT_SCHEMA_VERSION,
    policySchemaVersion: POLICY_SCHEMA_VERSION,
    policyCompilerVersion: POLICY_COMPILER_VERSION,
    placementStatus: kernel.solver.placementStatus,
    searchStatus: kernel.solver.searchStatus,
    capacityStatus: kernel.solver.capacityStatus,
    confirmationRequired: kernel.solver.confirmationRequired,
    publishable: kernel.solver.publishable,
    generationInputHash: kernel.generationInputHash,
  };
}
