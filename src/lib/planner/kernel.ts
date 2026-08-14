import type { Completion, Goal } from "@/lib/goals/types";
import {
  isCompletionAdmissible,
} from "@/lib/goals/admissible";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
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
  getWindowState,
  intersectDateWindows,
  monthFromDate,
  type DateWindow,
} from "@/lib/planner/dates";
import {
  evaluateGoalEligibility,
  type EligibilityGoal,
  type EligibilityReason,
} from "@/lib/planner/eligibility";
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
  SolverSolveIntent,
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

export type PlannerErrorCode =
  | "validation_failed"
  | "plan_too_large"
  | "invariant_failed";

export class PlannerError extends Error {
  constructor(
    readonly code: PlannerErrorCode,
    readonly httpStatus: number,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PlannerError";
  }
}

export interface PlannerKernelInput {
  schemaVersion: typeof PLANNER_CONTRACT_VERSION;
  eligibilityMode: PlannerEligibilityMode;
  solveIntent?: SolverSolveIntent;
  preserveExistingAssignments?: boolean;
  draftPinnedDates?: Record<string, string>;
  ownerId: string;
  startDate: string;
  endDate: string;
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
  /**
   * Echoed because it changes placement and is therefore part of the
   * generation hash. Save must reproduce the preview's value exactly, and the
   * three call sites had drifted apart.
   */
  preserveExistingAssignments: boolean;
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
  windowPlannedCount: number;
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

function allocateOrdinalWindow({
  goal,
  normalizedRequirement,
  window,
  asOfDate,
  reconciledUnits,
}: {
  goal: Goal;
  normalizedRequirement: NormalizedGoalRequirement;
  window: DateWindow;
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
  const windowMonths = enumerateMonthsInWindow(window);
  if (!windowMonths.some((month) => lifetimeMonths.includes(month))) {
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
  }

  const finalOrdinalsByMonth = new Map(
    lifetimeMonths.map((month) => [month, [] as number[]])
  );
  const ownerUncreditedByMonth = new Map(
    lifetimeMonths.map((month) => [month, [] as number[]])
  );
  const ownerMonthByOrdinal = new Map<number, string>();
  for (let ordinal = 1; ordinal <= requirement.targetCount; ordinal += 1) {
    const ownerMonth = ownerMonthForOrdinal({
      months: lifetimeMonths,
      targetCount: requirement.targetCount,
      ordinal,
    });
    ownerMonthByOrdinal.set(ordinal, ownerMonth);
    ownerUncreditedByMonth.get(ownerMonth)!.push(ordinal);
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
    scopedOrdinals: new Set(
      windowMonths.flatMap((month) => finalOrdinalsByMonth.get(month) ?? [])
    ),
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
  const weeklyAnchorContext = {
    weekStartsOn: normalizeWeekStartsOn(policy.weekStartsOn),
  };
  const window = {
    start: rawInput.startDate,
    end: rawInput.endDate,
  };
  const scopeState = getWindowState(window, rawInput.asOfDate);
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
      window,
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
  const policyRangeCount = policy.blackoutRanges.length;
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
      window,
      asOfDate: rawInput.asOfDate,
      baseAssignments,
      ordinalsForScopeMonth: reconcileAcrossAllOrdinals,
      weeklyAnchor: weeklyAnchorContext,
    });
    const reconciled = reconcilePlannerCompletions({
      goal,
      workUnits: materialized,
      completions,
      asOfDate: rawInput.asOfDate,
      previousCompletionToUnit,
      // Historical window re-runs should not anchor credits to window-local
      // scheduled dates, which can differ between date-window base plans.
      allowScheduledDateMatching: scopeState !== "historical",
    });
    const ordinalAllocation =
      requirement.requirement.kind === "cadence"
        ? undefined
        : allocateOrdinalWindow({
            goal,
            normalizedRequirement: requirement,
            window,
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
        windowPlannedCount: scopedOrdinals?.size ?? 0,
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
        weeklyAnchor: weeklyAnchorContext,
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
    preserveExistingAssignments:
      rawInput.preserveExistingAssignments === true,
    draftPinnedDates: rawInput.draftPinnedDates ?? {},
  });
  const dates = enumerateDates(window);
  const solveIntentForRun = rawInput.solveIntent ?? "stable";
  const draftPinnedDates = rawInput.draftPinnedDates ?? {};
  const pinnedUnitIds = new Set(
    Object.keys(draftPinnedDates).map((entryKey) => {
      const separatorIndex = entryKey.indexOf(":");
      return getSolverUnitId({
        goalId: entryKey.slice(0, separatorIndex),
        unitKey: entryKey.slice(separatorIndex + 1),
      });
    })
  );
  // Anchors come from a pass with the draft pins released: a pinned unit should
  // slot in where its own date puts it, and everything else should stay where it
  // already sits. Hard locks and preserve-mode stay applied, so the anchor pass
  // reflects the same constraints the real solve will face.
  //
  // Without this, a draft on an unpublished month has no anchors and no
  // stability signal at all: `previousDate` comes from the published plan, so a
  // single pin would sort first and push everything after it.
  const anchoredSolverUnits =
    pinnedUnitIds.size > 0
      ? (() => {
          const released = solveOrderedDpV1({
            dates,
            units: solverUnits.map((unit) =>
              pinnedUnitIds.has(getSolverUnitId(unit))
                ? { ...unit, lockedDate: null }
                : unit
            ),
            solveIntent: solveIntentForRun,
          });
          const anchorByUnitId = new Map(
            released.assignments.map((assignment) => [
              getSolverUnitId(assignment),
              assignment.scheduledDate,
            ])
          );
          return solverUnits.map((unit) => {
            const anchor =
              anchorByUnitId.get(getSolverUnitId(unit)) ?? unit.previousDate;
            return {
              ...unit,
              solveOrderAnchor: anchor,
              // Stability is measured against the layout on screen, not the
              // published plan, or an unpublished month has nothing to be
              // stable against and every unit is free to compact.
              previousDate: anchor,
            };
          });
        })()
      : solverUnits;
  const solver = solveOrderedDpV1({
    dates,
    units: anchoredSolverUnits,
    solveIntent: solveIntentForRun,
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
    solveIntent: rawInput.solveIntent ?? "stable",
    preserveExistingAssignments:
      rawInput.preserveExistingAssignments === true,
    draftPinnedDates: rawInput.draftPinnedDates ?? {},
    startDate: rawInput.startDate,
    endDate: rawInput.endDate,
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
    preserveExistingAssignments:
      rawInput.preserveExistingAssignments === true,
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
