import type { Completion, Goal } from "@/lib/goals/types";
import {
  isCompletionAdmissible,
} from "@/lib/goals/admissible";
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
import {
  enumerateMonthsInWindow,
  enumerateDates,
  getScopeDateRange,
  getScopeState,
  intersectDateWindows,
  monthFromDate,
} from "@/lib/planner/dates";
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
  isDateAllowedByPolicy,
  plannerPolicySchema,
  type CompiledPolicy,
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
  horizonSummary: PlannerGoalHorizonSummary[];
}

export interface PlannerGoalHorizonSummary {
  goalId: string;
  kind: "milestone_sequence" | "deadline_total";
  totalCount: number;
  creditedCount: number;
  remainingCount: number;
  scopeMonthPlannedCount: number;
  months: Array<{
    month: string;
    plannedCount: number;
  }>;
}

interface OrdinalScopeAllocation {
  scopedOrdinals: Set<number>;
  monthOrdinals: Map<string, number[]>;
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

function ownerMonthForOrdinal({
  months,
  targetCount,
  ordinal,
}: {
  months: string[];
  targetCount: number;
  ordinal: number;
}) {
  const ownerIndex = Math.floor(((ordinal - 1) * months.length) / targetCount);
  return months[ownerIndex]!;
}

function countDateWindowDays({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.floor((endDate.getTime() - startDate.getTime()) / dayMs) + 1
  );
}

function dedupeMonthDistribution(
  entries: Array<{ month: string; count: number }>
) {
  const countByMonth = new Map<string, number>();
  for (const entry of entries) {
    if (entry.count <= 0) {
      continue;
    }
    countByMonth.set(
      entry.month,
      (countByMonth.get(entry.month) ?? 0) + entry.count
    );
  }
  return Array.from(countByMonth.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((left, right) => compareCanonicalStrings(left.month, right.month));
}

function normalizeDistributionToTarget({
  distribution,
  targetCount,
}: {
  distribution: Array<{ month: string; count: number }>;
  targetCount: number;
}) {
  const total = distribution.reduce((count, entry) => count + entry.count, 0);
  if (targetCount <= 0 || total <= 0) {
    return [] as Array<{ month: string; count: number }>;
  }
  if (total === targetCount) {
    return distribution;
  }
  const normalized = distribution.map((entry) => {
    const raw = (entry.count * targetCount) / total;
    const floorCount = Math.floor(raw);
    return {
      month: entry.month,
      count: floorCount,
      fractionalRemainder: raw - floorCount,
    };
  });
  let remaining = targetCount - normalized.reduce((count, entry) => count + entry.count, 0);
  for (const candidate of [...normalized].sort((left, right) => {
    if (left.fractionalRemainder !== right.fractionalRemainder) {
      return right.fractionalRemainder - left.fractionalRemainder;
    }
    return compareCanonicalStrings(left.month, right.month);
  })) {
    if (remaining <= 0) {
      break;
    }
    const target = normalized.find((entry) => entry.month === candidate.month);
    if (!target) {
      continue;
    }
    target.count += 1;
    remaining -= 1;
  }
  return normalized
    .map(({ month, count }) => ({ month, count }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => compareCanonicalStrings(left.month, right.month));
}

function normalizeMonthlyDistributionForLifetime({
  lifetimeMonths,
  targetCount,
  distribution,
}: {
  lifetimeMonths: string[];
  targetCount: number;
  distribution: Array<{ month: string; count: number }> | undefined;
}) {
  if (!distribution || distribution.length === 0) {
    return null;
  }
  const lifetimeMonthSet = new Set(lifetimeMonths);
  const bounded = dedupeMonthDistribution(distribution).filter((entry) =>
    lifetimeMonthSet.has(entry.month)
  );
  if (bounded.length === 0) {
    return null;
  }
  const normalized = normalizeDistributionToTarget({
    distribution: bounded,
    targetCount,
  });
  if (normalized.length === 0) {
    return null;
  }
  const countByMonth = new Map(
    lifetimeMonths.map((month) => [month, 0])
  );
  for (const entry of normalized) {
    countByMonth.set(entry.month, entry.count);
  }
  return countByMonth;
}

function allocateOrdinalScopeMonth({
  goal,
  normalizedRequirement,
  compiledPolicy,
  scopeMonth,
  asOfDate,
  reconciledUnits,
}: {
  goal: Goal;
  normalizedRequirement: NormalizedGoalRequirement;
  compiledPolicy: CompiledPolicy;
  scopeMonth: string;
  asOfDate: string;
  reconciledUnits: PlannerWorkUnit[];
}): OrdinalScopeAllocation | undefined {
  const requirement = normalizedRequirement.requirement;
  if (requirement.kind === "cadence") {
    return undefined;
  }
  const lifetimeMonths = enumerateMonthsInWindow({
    start: goal.start_date,
    end: goal.end_date ?? goal.start_date,
  });
  if (!lifetimeMonths.includes(scopeMonth)) {
    return {
      scopedOrdinals: new Set<number>(),
      monthOrdinals: new Map(),
    };
  }

  const monthWindows = new Map(
    lifetimeMonths.map((month) => [month, getScopeDateRange(month)])
  );
  const projectableStart =
    compareCanonicalStrings(asOfDate, goal.start_date) > 0
      ? asOfDate
      : goal.start_date;
  const reservedCompletionDates = new Set(
    reconciledUnits
      .map((unit) => unit.creditedCompletionDate)
      .filter((date): date is string => date !== null)
  );
  const hasPolicyDateFilters =
    compiledPolicy.policy.restWeekdays.length > 0 ||
    compiledPolicy.policy.blackoutRanges.length > 0 ||
    Boolean(compiledPolicy.policy.goalAllowedWeekdays[goal.id]);
  const monthCapacity = new Map<string, number>();
  for (const month of lifetimeMonths) {
    const monthWindow = monthWindows.get(month)!;
    if (compareCanonicalStrings(monthWindow.end, asOfDate) < 0) {
      monthCapacity.set(month, 0);
      continue;
    }
    const projectableWindow = intersectDateWindows(monthWindow, {
      start: projectableStart,
      end: goal.end_date ?? monthWindow.end,
    });
    if (!projectableWindow) {
      monthCapacity.set(month, 0);
      continue;
    }
    if (!hasPolicyDateFilters) {
      let reservedDatesInWindow = 0;
      for (const date of reservedCompletionDates) {
        if (
          compareCanonicalStrings(date, projectableWindow.start) >= 0 &&
          compareCanonicalStrings(date, projectableWindow.end) <= 0
        ) {
          reservedDatesInWindow += 1;
        }
      }
      monthCapacity.set(
        month,
        Math.max(
          countDateWindowDays(projectableWindow) - reservedDatesInWindow,
          0
        )
      );
      continue;
    }
    const allowedDates = enumerateDates(projectableWindow).filter((date) =>
      isDateAllowedByPolicy(compiledPolicy, goal.id, date, true)
    );
    let reservedDatesInWindow = 0;
    for (const date of allowedDates) {
      if (reservedCompletionDates.has(date)) {
        reservedDatesInWindow += 1;
      }
    }
    monthCapacity.set(
      month,
      Math.max(allowedDates.length - reservedDatesInWindow, 0)
    );
  }

  const finalOrdinalsByMonth = new Map(
    lifetimeMonths.map((month) => [month, [] as number[]])
  );
  const ownerUncreditedByMonth = new Map(
    lifetimeMonths.map((month) => [month, [] as number[]])
  );
  const ownerMonthByOrdinal = new Map<number, string>();
  const policyDistribution = normalizeMonthlyDistributionForLifetime({
    lifetimeMonths,
    targetCount: requirement.targetCount,
    distribution: compiledPolicy.policy.goalMonthlyDistributions?.[goal.id],
  });
  if (policyDistribution) {
    let ordinal = 1;
    for (const month of lifetimeMonths) {
      const monthCount = policyDistribution.get(month) ?? 0;
      const queue = ownerUncreditedByMonth.get(month)!;
      for (
        let assigned = 0;
        assigned < monthCount && ordinal <= requirement.targetCount;
        assigned += 1
      ) {
        queue.push(ordinal);
        ownerMonthByOrdinal.set(ordinal, month);
        ordinal += 1;
      }
    }
  } else {
    for (let ordinal = 1; ordinal <= requirement.targetCount; ordinal += 1) {
      const ownerMonth = ownerMonthForOrdinal({
        months: lifetimeMonths,
        targetCount: requirement.targetCount,
        ordinal,
      });
      ownerMonthByOrdinal.set(ordinal, ownerMonth);
      ownerUncreditedByMonth.get(ownerMonth)!.push(ordinal);
    }
  }

  for (const unit of reconciledUnits) {
    if (
      unit.kind !== requirement.kind ||
      unit.creditedCompletionDate === null ||
      unit.ordinal <= 0 ||
      unit.ordinal > requirement.targetCount
    ) {
      continue;
    }
    const ownerMonth =
      ownerMonthByOrdinal.get(unit.ordinal) ??
      ownerMonthForOrdinal({
        months: lifetimeMonths,
        targetCount: requirement.targetCount,
        ordinal: unit.ordinal,
      });
    const completionMonth = monthFromDate(unit.creditedCompletionDate);
    const pinnedMonth = lifetimeMonths.includes(completionMonth)
      ? completionMonth
      : ownerMonth;
    const ownerQueue = ownerUncreditedByMonth.get(ownerMonth)!;
    const ownerIndex = ownerQueue.indexOf(unit.ordinal);
    if (ownerIndex >= 0) {
      ownerQueue.splice(ownerIndex, 1);
    }
    finalOrdinalsByMonth.get(pinnedMonth)!.push(unit.ordinal);
  }

  const carryQueue: number[] = [];
  const nonElapsedMonths = lifetimeMonths.filter(
    (month) => compareCanonicalStrings(monthWindows.get(month)!.end, asOfDate) >= 0
  );
  for (const month of lifetimeMonths) {
    const monthWindow = monthWindows.get(month)!;
    const localUncredited = ownerUncreditedByMonth.get(month)!;
    if (compareCanonicalStrings(monthWindow.end, asOfDate) < 0) {
      carryQueue.push(...localUncredited);
      continue;
    }
    const monthQueue =
      carryQueue.length === 0
        ? [...localUncredited]
        : [...carryQueue, ...localUncredited];
    const assignCount = Math.min(
      monthQueue.length,
      monthCapacity.get(month) ?? 0
    );
    if (assignCount > 0) {
      finalOrdinalsByMonth.get(month)!.push(...monthQueue.slice(0, assignCount));
    }
    carryQueue.splice(0, carryQueue.length, ...monthQueue.slice(assignCount));
  }

  if (carryQueue.length > 0) {
    const overflowMonth =
      nonElapsedMonths[0] ?? lifetimeMonths[lifetimeMonths.length - 1];
    if (overflowMonth) {
      finalOrdinalsByMonth.get(overflowMonth)!.push(...carryQueue);
    }
  }

  return {
    scopedOrdinals: new Set(finalOrdinalsByMonth.get(scopeMonth) ?? []),
    monthOrdinals: finalOrdinalsByMonth,
  };
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
  const scopeState = getScopeState(rawInput.scopeMonth, rawInput.asOfDate);
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
  const previousCompletionToUnit = rawInput.basePlan?.completionToUnit ?? {};
  const workUnits: PlannerWorkUnit[] = [];
  const completionToUnit: Record<
    string,
    PlannerCompletionUnitIdentity
  > = {};
  const driftFacts: PlannerKernelOutput["driftFacts"] = [];
  const horizonSummary: PlannerGoalHorizonSummary[] = [];
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
    const reconcileAcrossAllOrdinals =
      requirement.requirement.kind === "cadence"
        ? undefined
        : new Set(
            Array.from(
              { length: requirement.requirement.targetCount },
              (_, index) => index + 1
            )
          );
    const materialized = materializeWorkUnits({
      goal,
      normalizedRequirement: requirement,
      eligibilityMode: rawInput.eligibilityMode,
      scopeMonth: rawInput.scopeMonth,
      asOfDate: rawInput.asOfDate,
      baseAssignments,
      ordinalsForScopeMonth: reconcileAcrossAllOrdinals,
    });
    const reconciled = reconcilePlannerCompletions({
      goal,
      workUnits: materialized,
      completions,
      asOfDate: rawInput.asOfDate,
      previousCompletionToUnit,
      // Historical scope re-runs should not anchor credits to month-local
      // scheduled dates, which can differ between scope-month base plans.
      allowScheduledDateMatching: scopeState !== "historical",
    });
    const ordinalAllocation =
      requirement.requirement.kind === "cadence"
        ? undefined
        : allocateOrdinalScopeMonth({
            goal,
            normalizedRequirement: requirement,
            compiledPolicy,
            scopeMonth: rawInput.scopeMonth,
            asOfDate: rawInput.asOfDate,
            reconciledUnits: reconciled.units,
          });
    const scopedOrdinals =
      requirement.requirement.kind === "cadence"
        ? null
        : (ordinalAllocation?.scopedOrdinals ?? new Set<number>());
    const scopedUnits =
      scopedOrdinals === null
        ? reconciled.units
        : reconciled.units.filter((unit) => scopedOrdinals.has(unit.ordinal));
    const scopedUnitKeys = new Set(scopedUnits.map((unit) => unit.unitKey));
    const scopedCompletionToUnit = Object.fromEntries(
      Object.entries(reconciled.completionToUnit).filter(([, identity]) =>
        scopedUnitKeys.has(identity.unitKey)
      )
    );
    throwBounds(
      workUnits.length + scopedUnits.length > MAX_WORK_UNITS,
      "work units",
      workUnits.length + scopedUnits.length,
      MAX_WORK_UNITS
    );
    workUnits.push(...scopedUnits);
    Object.assign(completionToUnit, scopedCompletionToUnit);
    driftFacts.push(...reconciled.driftFacts);
    if (
      requirement.requirement.kind !== "cadence" &&
      ordinalAllocation !== undefined
    ) {
      const creditedCount = reconciled.units.filter(
        (unit) => unit.creditedCompletionId !== null
      ).length;
      horizonSummary.push({
        goalId: goal.id,
        kind: requirement.requirement.kind,
        totalCount: requirement.requirement.targetCount,
        creditedCount,
        remainingCount: Math.max(
          requirement.requirement.targetCount - creditedCount,
          0
        ),
        scopeMonthPlannedCount: scopedOrdinals?.size ?? 0,
        months: Array.from(ordinalAllocation.monthOrdinals.entries())
          .map(([month, ordinals]) => ({
            month,
            plannedCount: ordinals.length,
          }))
          .filter((entry) => entry.plannedCount > 0),
      });
    }
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
    scopeState,
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
    horizonSummary,
  };
  plannerKernelOutputSchema.parse(output);
  return output;
}
