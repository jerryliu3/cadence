import type { Completion, Goal } from "@/lib/goals/types";
import { isCompletionAdmissible } from "@/lib/goals/admissible";
import { compareCanonicalStrings } from "@/lib/planner/canonical";
import {
  createDefaultAssessment,
  goalAssessmentSchema,
  computeAssessmentInputHash,
  type GoalAssessment,
} from "@/lib/planner/assessment";
import {
  MAX_COMPLETION_FACTS,
  MAX_ELIGIBLE_GOALS,
  MAX_POLICY_RANGES,
  MAX_WORK_UNITS,
  type PlannerEligibilityMode,
  PLANNER_CONTRACT_VERSION,
} from "@/lib/planner/contracts/bounds";
import {
  plannerKernelInputSchema,
  plannerKernelOutputSchema,
} from "@/lib/planner/contracts/kernel-schema";
import { diffPlannerAssignments } from "@/lib/planner/diff";
import { getScopeDateRange, getScopeState, enumerateDates } from "@/lib/planner/dates";
import {
  evaluateGoalEligibility,
  type EligibilityGoal,
  type EligibilityReason,
} from "@/lib/planner/eligibility";
import { PlannerError } from "@/lib/planner/errors";
import {
  computeGenerationInputHash,
  type PlannerCanonicalLink,
} from "@/lib/planner/fingerprint";
import {
  compilePlannerPolicy,
  plannerPolicySchema,
  type PlannerPolicy,
} from "@/lib/planner/policy";
import { resolvePlannerEffectiveScheduledTime } from "@/lib/planner/schedule-time";
import {
  reconcilePlannerCompletions,
  type PlannerCompletionUnitIdentity,
} from "@/lib/planner/reconciliation";
import {
  normalizeGoalRequirement,
  type NormalizedGoalRequirement,
} from "@/lib/planner/requirements";
import { solveOrderedDpV1 } from "@/lib/planner/solver/ordered-dp-v1";
import { projectWorkUnitsToSolver } from "@/lib/planner/solver/project";
import type {
  PlannerIssueCode,
  PlannerSolverResult,
} from "@/lib/planner/solver/types";
import { getSolverUnitId } from "@/lib/planner/solver/types";
import {
  validateMergedWorkUnitAssignments,
  validateSolverResult,
} from "@/lib/planner/solver/validation";
import {
  materializeWorkUnits,
  type PlannerBaseAssignment,
  type PlannerWorkUnit,
} from "@/lib/planner/work-units";

export interface PlannerKernelInput {
  schemaVersion: typeof PLANNER_CONTRACT_VERSION;
  eligibilityMode: PlannerEligibilityMode;
  ownerId: string;
  scopeMonth: string;
  asOfDate: string;
  timezone: string;
  goals: Goal[];
  completions: Completion[];
  links: PlannerCanonicalLink[];
  assessments?: GoalAssessment[];
  policy: PlannerPolicy;
  basePlan: {
    planId: string;
    version: number;
    assignments: PlannerBaseAssignment[];
    completionToUnit?: Record<string, PlannerCompletionUnitIdentity>;
    issueCodes?: PlannerIssueCode[];
  } | null;
}

export interface PlannerKernelOutput {
  schemaVersion: typeof PLANNER_CONTRACT_VERSION;
  eligibilityMode: PlannerEligibilityMode;
  generationInputHash: string;
  scopeState: "historical" | "current" | "future";
  solver: PlannerSolverResult;
  workUnits: PlannerWorkUnit[];
  completionToUnit: Record<string, PlannerCompletionUnitIdentity>;
  driftFacts: ReturnType<
    typeof reconcilePlannerCompletions
  >["driftFacts"];
  eligibility: Array<{
    goalId: string;
    eligible: boolean;
    reason: EligibilityReason;
  }>;
  diff: ReturnType<typeof diffPlannerAssignments>;
  validation: ReturnType<typeof validateSolverResult>;
  suggestedRelaxations: string[];
}

function currentLinkRole(
  goalId: string,
  links: PlannerCanonicalLink[]
): EligibilityGoal["currentLinkRole"] {
  if (links.some((link) => link.sourceGoalId === goalId)) {
    return "source";
  }
  if (links.some((link) => link.targetGoalId === goalId)) {
    return "target";
  }
  return "none";
}

function throwBounds(
  condition: boolean,
  dimension: string,
  actual: number,
  maximum: number
) {
  if (condition) {
    throw new PlannerError(
      "plan_too_large",
      413,
      `Planner ${dimension} exceeds the supported bound.`,
      { dimension, actual, maximum }
    );
  }
}

function suggestedRelaxations(issueCodes: PlannerIssueCode[]) {
  const suggestions = new Set<string>();
  if (issueCodes.includes("placement_shortfall")) {
    suggestions.add("Reduce rest weekdays or blackout dates.");
    suggestions.add("Allow more weekdays for affected goals.");
    suggestions.add("Accept a reviewed partial plan.");
  }
  if (issueCodes.includes("invalid_lock")) {
    suggestions.add("Unlock the conflicting item before regenerating.");
  }
  if (issueCodes.includes("soft_optimization_exhausted")) {
    suggestions.add("Keep the hard-feasible plan or retry optimization.");
  }
  return Array.from(suggestions);
}

export function runPlannerKernel(
  rawInput: PlannerKernelInput
): PlannerKernelOutput {
  if (rawInput.schemaVersion !== PLANNER_CONTRACT_VERSION) {
    throw new PlannerError(
      "validation_failed",
      400,
      "Unsupported planner contract version."
    );
  }
  const contractResult = plannerKernelInputSchema.safeParse(rawInput);
  if (!contractResult.success) {
    throw new PlannerError(
      "validation_failed",
      400,
      "Planner kernel input failed contract validation.",
      { issues: contractResult.error.issues }
    );
  }
  const compiledPolicy = compilePlannerPolicy(
    plannerPolicySchema.parse(rawInput.policy)
  );
  const policy = compiledPolicy.policy;
  if (policy.timezone !== rawInput.timezone) {
    throw new PlannerError(
      "validation_failed",
      400,
      "Planner timezone must match the snapshotted policy timezone."
    );
  }

  const goals = [...rawInput.goals].sort((left, right) =>
    compareCanonicalStrings(left.id, right.id)
  );
  const links = [...rawInput.links].sort((left, right) => {
    const bySource = compareCanonicalStrings(
      left.sourceGoalId,
      right.sourceGoalId
    );
    return bySource !== 0
      ? bySource
      : compareCanonicalStrings(left.targetGoalId, right.targetGoalId);
  });
  const eligibility = goals.map((goal) => ({
    goal,
    decision: evaluateGoalEligibility({
      eligibilityMode: rawInput.eligibilityMode,
      scopeMonth: rawInput.scopeMonth,
      ownerId: rawInput.ownerId,
      goal,
      currentLinkRole: currentLinkRole(goal.id, links),
    }),
  }));
  const eligibleGoals = eligibility
    .filter((entry) => entry.decision.eligible)
    .map((entry) => entry.goal);
  throwBounds(
    eligibleGoals.length > MAX_ELIGIBLE_GOALS,
    "eligible goals",
    eligibleGoals.length,
    MAX_ELIGIBLE_GOALS
  );

  const eligibleGoalIds = new Set(eligibleGoals.map((goal) => goal.id));
  const completions = rawInput.completions
    .filter((completion) => eligibleGoalIds.has(completion.goal_id))
    .sort((left, right) => {
      const byGoal = compareCanonicalStrings(left.goal_id, right.goal_id);
      if (byGoal !== 0) return byGoal;
      const byDate = compareCanonicalStrings(
        left.completed_on,
        right.completed_on
      );
      return byDate !== 0
        ? byDate
        : compareCanonicalStrings(left.id, right.id);
    });
  throwBounds(
    completions.length > MAX_COMPLETION_FACTS,
    "completion facts",
    completions.length,
    MAX_COMPLETION_FACTS
  );
  const policyRangeCount =
    policy.blackoutRanges.length + policy.datePreferences.length;
  throwBounds(
    policyRangeCount > MAX_POLICY_RANGES,
    "policy ranges",
    policyRangeCount,
    MAX_POLICY_RANGES
  );
  let ordinalUnitCount = 0;
  for (const goal of eligibleGoals) {
    const targetCount =
      goal.frequency_type === "fixed_milestones"
        ? Math.max(1, goal.target_count ?? 0)
        : goal.target_count && goal.target_count > 0
          ? goal.target_count
          : 0;
    if (targetCount > MAX_WORK_UNITS - ordinalUnitCount) {
      throw new PlannerError(
        "plan_too_large",
        413,
        "Planner work units exceeds the supported bound.",
        {
          dimension: "work units",
          actual: ordinalUnitCount + targetCount,
          maximum: MAX_WORK_UNITS,
        }
      );
    }
    ordinalUnitCount += targetCount;
  }

  const normalizedRequirements = new Map<
    string,
    NormalizedGoalRequirement
  >();
  const suppliedAssessments = new Map(
    (rawInput.assessments ?? []).map((assessment) => [
      assessment.goalId,
      goalAssessmentSchema.parse(assessment),
    ])
  );
  const assessments = new Map<string, GoalAssessment>();
  for (const goal of eligibleGoals) {
    const requirement = normalizeGoalRequirement(goal);
    normalizedRequirements.set(goal.id, requirement);
    const supplied = suppliedAssessments.get(goal.id);
    assessments.set(
      goal.id,
      supplied &&
        supplied.assessmentInputHash ===
          computeAssessmentInputHash(goal, requirement)
        ? supplied
        : createDefaultAssessment(goal)
    );
  }

  const baseAssignments = rawInput.basePlan?.assignments ?? [];
  const workUnits: PlannerWorkUnit[] = [];
  const completionToUnit: Record<
    string,
    PlannerCompletionUnitIdentity
  > = {};
  const driftFacts: PlannerKernelOutput["driftFacts"] = [];
  for (const goal of eligibleGoals) {
    const requirement = normalizedRequirements.get(goal.id)!;
    if (
      requirement.requirement.kind !== "cadence" &&
      requirement.requirement.targetCount >
        MAX_WORK_UNITS - workUnits.length
    ) {
      throw new PlannerError(
        "plan_too_large",
        413,
        "Planner work units exceeds the supported bound.",
        {
          dimension: "work units",
          actual:
            workUnits.length + requirement.requirement.targetCount,
          maximum: MAX_WORK_UNITS,
        }
      );
    }
    const materialized = materializeWorkUnits({
      goal,
      normalizedRequirement: requirement,
      eligibilityMode: rawInput.eligibilityMode,
      scopeMonth: rawInput.scopeMonth,
      asOfDate: rawInput.asOfDate,
      baseAssignments,
    });
    const reconciled = reconcilePlannerCompletions({
      goal,
      workUnits: materialized,
      completions,
      asOfDate: rawInput.asOfDate,
      previousCompletionToUnit:
        rawInput.basePlan?.completionToUnit ?? {},
    });
    throwBounds(
      workUnits.length + reconciled.units.length > MAX_WORK_UNITS,
      "work units",
      workUnits.length + reconciled.units.length,
      MAX_WORK_UNITS
    );
    workUnits.push(...reconciled.units);
    Object.assign(completionToUnit, reconciled.completionToUnit);
    driftFacts.push(...reconciled.driftFacts);
  }
  throwBounds(
    workUnits.length > MAX_WORK_UNITS,
    "work units",
    workUnits.length,
    MAX_WORK_UNITS
  );

  const orderedWorkUnits = workUnits.sort((left, right) => {
    const byGoal = compareCanonicalStrings(
      left.originalGoalId,
      right.originalGoalId
    );
    return byGoal !== 0
      ? byGoal
      : left.ordinal - right.ordinal ||
          compareCanonicalStrings(left.unitKey, right.unitKey);
  });
  const completionDatesByGoal = new Map<string, Set<string>>();
  const eligibleGoalById = new Map(
    eligibleGoals.map((goal) => [goal.id, goal])
  );
  for (const completion of completions) {
    const goal = eligibleGoalById.get(completion.goal_id);
    if (
      !goal ||
      !isCompletionAdmissible(goal, completion.completed_on, {
        asOfDate: rawInput.asOfDate,
      })
    ) {
      continue;
    }
    const dates =
      completionDatesByGoal.get(completion.goal_id) ?? new Set<string>();
    dates.add(completion.completed_on);
    completionDatesByGoal.set(completion.goal_id, dates);
  }
  const solverUnits = projectWorkUnitsToSolver({
    workUnits: orderedWorkUnits,
    compiledPolicy,
    assessments,
    completionDatesByGoal,
  });
  const dates = enumerateDates(getScopeDateRange(rawInput.scopeMonth));
  const solver = solveOrderedDpV1({
    dates,
    units: solverUnits,
  });
  const historicalIssueCodes: PlannerIssueCode[] = [];
  if (
    orderedWorkUnits.some(
      (unit) => unit.classification === "historical_miss"
    )
  ) {
    historicalIssueCodes.push("historical_miss");
  }
  if (
    orderedWorkUnits.some(
      (unit) => unit.classification === "historical_shortfall"
    )
  ) {
    historicalIssueCodes.push("historical_shortfall");
  }
  solver.issueCodes = Array.from(
    new Set([...solver.issueCodes, ...historicalIssueCodes])
  );
  let validation = validateSolverResult(solverUnits, solver);
  if (
    !validation.valid &&
    !solver.issueCodes.includes("invalid_lock")
  ) {
    throw new PlannerError(
      "invariant_failed",
      500,
      "Planner solver output violated a hard invariant.",
      { invariantViolations: validation.invariantViolations }
    );
  }

  const solverAssignments = new Map(
    solver.assignments.map((assignment) => [
      getSolverUnitId(assignment),
      assignment.scheduledDate,
    ])
  );
  const invalidLockGoalIds = new Set(solver.invalidGoalIds);
  for (const unit of orderedWorkUnits) {
    if (invalidLockGoalIds.has(unit.originalGoalId)) {
      continue;
    }
    const unitId = getSolverUnitId({
      goalId: unit.originalGoalId,
      unitKey: unit.unitKey,
    });
    if (solverAssignments.has(unitId)) {
      unit.scheduledDate =
        solverAssignments.get(unitId) ?? null;
    }
  }
  for (const unit of orderedWorkUnits) {
    const resolvedTime = resolvePlannerEffectiveScheduledTime({
      scheduledDate: unit.scheduledDate,
      scheduledTimeOverride: unit.scheduledTimeOverride ?? null,
    });
    if (
      resolvedTime.scheduledTimeOverride === null &&
      resolvedTime.effectiveScheduledLocalTime === null &&
      resolvedTime.effectiveScheduledAtLocal === null
    ) {
      delete unit.scheduledTimeOverride;
      delete unit.effectiveScheduledLocalTime;
      delete unit.effectiveScheduledAtLocal;
      continue;
    }
    unit.scheduledTimeOverride = resolvedTime.scheduledTimeOverride;
    unit.effectiveScheduledLocalTime = resolvedTime.effectiveScheduledLocalTime;
    unit.effectiveScheduledAtLocal = resolvedTime.effectiveScheduledAtLocal;
  }
  const mergedValidation =
    validateMergedWorkUnitAssignments(orderedWorkUnits);
  validation = {
    valid: validation.valid && mergedValidation.valid,
    invariantViolations: Array.from(
      new Set([
        ...validation.invariantViolations,
        ...mergedValidation.invariantViolations,
      ])
    ).sort(),
  };
  if (
    !validation.valid &&
    !solver.issueCodes.includes("invalid_lock")
  ) {
    throw new PlannerError(
      "invariant_failed",
      500,
      "Planner merged output violated a hard invariant.",
      { invariantViolations: validation.invariantViolations }
    );
  }
  const nextAssignments: PlannerBaseAssignment[] = orderedWorkUnits.map(
    (unit) => ({
      goalId: unit.originalGoalId,
      requirementFingerprint: unit.requirementFingerprint,
      unitKey: unit.unitKey,
      scheduledDate: unit.scheduledDate,
      locked: unit.locked,
    })
  );
  const normalizedAssessments = Array.from(assessments.values()).sort(
    (left, right) => compareCanonicalStrings(left.goalId, right.goalId)
  );
  const generationInputHash = computeGenerationInputHash({
    eligibilityMode: rawInput.eligibilityMode,
    scopeMonth: rawInput.scopeMonth,
    asOfDate: rawInput.asOfDate,
    timezone: rawInput.timezone,
    goals: eligibleGoals,
    completions,
    links,
    assessments: normalizedAssessments,
    policy,
    basePlan: rawInput.basePlan
      ? {
          planId: rawInput.basePlan.planId,
          version: rawInput.basePlan.version,
          assignments: baseAssignments,
          completionToUnit:
            rawInput.basePlan.completionToUnit ?? {},
        }
      : null,
  });

  const output: PlannerKernelOutput = {
    schemaVersion: PLANNER_CONTRACT_VERSION,
    eligibilityMode: rawInput.eligibilityMode,
    generationInputHash,
    scopeState: getScopeState(rawInput.scopeMonth, rawInput.asOfDate),
    solver,
    workUnits: orderedWorkUnits,
    completionToUnit,
    driftFacts: driftFacts.sort((left, right) => {
      const byDate = compareCanonicalStrings(
        left.completedOn,
        right.completedOn
      );
      if (byDate !== 0) return byDate;
      const byId = compareCanonicalStrings(
        left.completionId,
        right.completionId
      );
      return byId !== 0
        ? byId
        : compareCanonicalStrings(left.driftType, right.driftType);
    }),
    eligibility: eligibility.map(({ goal, decision }) => ({
      goalId: goal.id,
      eligible: decision.eligible,
      reason: decision.reason,
    })),
    diff: diffPlannerAssignments({
      baseAssignments,
      nextAssignments,
      baseIssues: rawInput.basePlan?.issueCodes ?? [],
      nextIssues: solver.issueCodes,
    }),
    validation,
    suggestedRelaxations: suggestedRelaxations(solver.issueCodes),
  };
  plannerKernelOutputSchema.parse(output);
  return output;
}
