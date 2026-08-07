import type { Goal } from "@/lib/goals/types";
import { canonicalHash } from "@/lib/planner/canonical";
import type { PlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  ASSESSMENT_SCHEMA_VERSION,
  PLANNER_CONTRACT_VERSION,
  type PlannerEligibilityMode,
  POLICY_COMPILER_VERSION,
  POLICY_SCHEMA_VERSION,
  REQUIREMENT_SCHEMA_VERSION,
  SCHEDULER_VERSION,
} from "@/lib/planner/contracts/bounds";
import { enumerateDates, getScopeDateRange, getUtcWeekday } from "@/lib/planner/dates";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";
import {
  compilePlannerPolicy,
  isDateAllowedByPolicy,
  type PlannerPolicy,
} from "@/lib/planner/policy";
import { createDefaultAssessment, type GoalAssessment } from "@/lib/planner/assessment";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";
import {
  projectPlannerDraftCommands,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import { resolvePlannerEffectiveScheduledTime } from "@/lib/planner/schedule-time";

type PlannerIssueSeverity = "informational" | "warning" | "blocking";

export interface PlannerPublishIntent {
  eligibilityMode: PlannerEligibilityMode;
  scopeMonth: string;
  previewHash: string;
  expectedCanonicalRevision: number;
  expectedExecutionRevision: number;
  expectedBasePlanId: string | null;
  expectedBasePlanVersion: number | null;
  policyOverride: PlannerPolicy | null;
  draftCommands: PlannerDraftCommand[];
}

export interface PlannerDraftItemEdit {
  goalId: string;
  unitKey: string;
  scheduledDate: string | null;
  label: string | null;
  scheduledTimeOverride?: string | null;
}

export class PlannerDraftEditValidationError extends Error {
  constructor(
    readonly code:
      | "draft_item_duplicate"
      | "draft_item_unknown"
      | "draft_item_unmovable"
      | "draft_item_out_of_window"
      | "draft_item_policy_blocked"
      | "draft_item_completion_exists"
      | "draft_item_collision",
    message: string,
    readonly details: Record<string, unknown>
  ) {
    super(message);
    this.name = "PlannerDraftEditValidationError";
  }
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
    scheduled_time_override: string | null;
    effective_scheduled_local_time: string | null;
    effective_scheduled_at_local: string | null;
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

function mergePlacementAndDraftMoveWindow(
  placementWindow: PlannerKernelOutput["workUnits"][number]["placementWindow"],
  draftMoveWindow: PlannerKernelOutput["workUnits"][number]["draftMoveWindow"]
) {
  if (!placementWindow) {
    return draftMoveWindow ?? null;
  }
  if (!draftMoveWindow) {
    return placementWindow;
  }
  return {
    start:
      placementWindow.start <= draftMoveWindow.start
        ? placementWindow.start
        : draftMoveWindow.start,
    end:
      placementWindow.end >= draftMoveWindow.end
        ? placementWindow.end
        : draftMoveWindow.end,
  };
}

function buildDraftEditKey(goalId: string, unitKey: string) {
  return `${goalId}:${unitKey}`;
}

function buildDraftItemEditsFromCommands(commands: PlannerDraftCommand[]) {
  const sortedCommands = sortPlannerDraftCommands(commands);
  const projectedItems = projectPlannerDraftCommands(sortedCommands);
  const draftItemEdits = Object.entries(projectedItems)
    .map(([entryKey, edit]) => {
      const separatorIndex = entryKey.indexOf(":");
      if (separatorIndex <= 0 || separatorIndex === entryKey.length - 1) {
        return null;
      }
      return {
        goalId: entryKey.slice(0, separatorIndex),
        unitKey: entryKey.slice(separatorIndex + 1),
        scheduledDate:
          edit.scheduledDate === undefined ? null : edit.scheduledDate,
        label: edit.label === undefined ? null : edit.label,
        scheduledTimeOverride: edit.scheduledTimeOverride,
      } as PlannerDraftItemEdit;
    })
    .filter((edit): edit is PlannerDraftItemEdit => edit !== null);
  return { draftItemEdits };
}

function isDraftItemImmovable(unit: PlannerKernelOutput["workUnits"][number]) {
  return (
    unit.creditState !== "uncredited" ||
    unit.classification === "historical_miss" ||
    unit.classification === "historical_shortfall" ||
    unit.classification === "satisfied_elsewhere"
  );
}

function applyValidatedDraftItemEdits({
  scopeMonth,
  policy,
  kernelWorkUnits,
  goalDefaultLocalTimeByGoalId,
  draftItemEdits,
  completions,
}: {
  scopeMonth: string;
  policy: PlannerPolicy;
  kernelWorkUnits: PlannerKernelOutput["workUnits"];
  goalDefaultLocalTimeByGoalId: Map<string, string | null>;
  draftItemEdits: PlannerDraftItemEdit[];
  completions: PlannerCanonicalSnapshot["completions"];
}) {
  const compiledPolicy = compilePlannerPolicy(policy);
  const scopeWindow = getScopeDateRange(scopeMonth);
  const workUnits = kernelWorkUnits.map((unit) => ({ ...unit }));
  const priorEffectiveTimeByKey = new Map(
    workUnits.map((unit) => [
      buildDraftEditKey(unit.originalGoalId, unit.unitKey),
      unit.effectiveScheduledLocalTime ?? null,
    ])
  );
  const unitByKey = new Map(
    workUnits.map((unit) => [buildDraftEditKey(unit.originalGoalId, unit.unitKey), unit])
  );
  const seenDraftEditKeys = new Set<string>();
  const nextScheduledByKey = new Map<string, string | null>();
  for (const unit of workUnits) {
    nextScheduledByKey.set(
      buildDraftEditKey(unit.originalGoalId, unit.unitKey),
      unit.scheduledDate
    );
  }

  const completionDatesByGoal = new Map<string, Set<string>>();
  for (const completion of completions) {
    const existing = completionDatesByGoal.get(completion.goal_id) ?? new Set<string>();
    existing.add(completion.completed_on);
    completionDatesByGoal.set(completion.goal_id, existing);
  }

  for (const edit of draftItemEdits) {
    const key = buildDraftEditKey(edit.goalId, edit.unitKey);
    if (seenDraftEditKeys.has(key)) {
      throw new PlannerDraftEditValidationError(
        "draft_item_duplicate",
        "Draft edits included the same planner item more than once.",
        { goalId: edit.goalId, unitKey: edit.unitKey }
      );
    }
    seenDraftEditKeys.add(key);

    const unit = unitByKey.get(key);
    if (!unit) {
      throw new PlannerDraftEditValidationError(
        "draft_item_unknown",
        "Draft edits referenced an item that is not in the current preview.",
        { goalId: edit.goalId, unitKey: edit.unitKey }
      );
    }

    const nextScheduledDate = edit.scheduledDate;
    const hasScheduledTimeChange =
      edit.scheduledTimeOverride !== undefined &&
      edit.scheduledTimeOverride !== (unit.scheduledTimeOverride ?? null);

    if (hasScheduledTimeChange && isDraftItemImmovable(unit)) {
      throw new PlannerDraftEditValidationError(
        "draft_item_unmovable",
        "Completed or historical planner items cannot be retimed in draft.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          classification: unit.classification,
          creditState: unit.creditState,
        }
      );
    }

    if (nextScheduledDate === null || nextScheduledDate === unit.scheduledDate) {
      continue;
    }

    if (isDraftItemImmovable(unit)) {
      throw new PlannerDraftEditValidationError(
        "draft_item_unmovable",
        "Completed or historical planner items cannot be moved in draft.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          classification: unit.classification,
          creditState: unit.creditState,
        }
      );
    }

    const moveWindow = unit.draftMoveWindow ?? unit.placementWindow;
    if (
      !moveWindow ||
      nextScheduledDate < moveWindow.start ||
      nextScheduledDate > moveWindow.end
    ) {
      throw new PlannerDraftEditValidationError(
        "draft_item_out_of_window",
        "Draft move date is outside the allowed planner window.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          scheduledDate: nextScheduledDate,
          placementWindow: unit.placementWindow,
          draftMoveWindow: unit.draftMoveWindow,
          moveWindow,
          scopeWindow,
        }
      );
    }

    if (
      !isDateAllowedByPolicy(
        compiledPolicy,
        unit.originalGoalId,
        nextScheduledDate,
        unit.restEligible
      )
    ) {
      throw new PlannerDraftEditValidationError(
        "draft_item_policy_blocked",
        "Draft move date conflicts with the active planning policy.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          scheduledDate: nextScheduledDate,
        }
      );
    }

    if (completionDatesByGoal.get(edit.goalId)?.has(nextScheduledDate)) {
      throw new PlannerDraftEditValidationError(
        "draft_item_completion_exists",
        "Draft move date already has a completion fact for this goal.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          scheduledDate: nextScheduledDate,
        }
      );
    }

    nextScheduledByKey.set(key, nextScheduledDate);
  }

  const scheduledDateOwnerByGoal = new Map<string, string>();
  for (const unit of workUnits) {
    const key = buildDraftEditKey(unit.originalGoalId, unit.unitKey);
    const finalDate = nextScheduledByKey.get(key) ?? null;
    if (!finalDate) {
      continue;
    }
    const goalDateKey = buildDraftEditKey(unit.originalGoalId, finalDate);
    const existingOwner = scheduledDateOwnerByGoal.get(goalDateKey);
    if (existingOwner && existingOwner !== key) {
      throw new PlannerDraftEditValidationError(
        "draft_item_collision",
        "Draft move would schedule two units for the same goal on the same date.",
        {
          goalId: unit.originalGoalId,
          scheduledDate: finalDate,
          unitKey: unit.unitKey,
          conflictingUnitKey: existingOwner.slice(existingOwner.indexOf(":") + 1),
        }
      );
    }
    scheduledDateOwnerByGoal.set(goalDateKey, key);
  }

  let draftMovedCount = 0;
  let draftRelabeledCount = 0;

  for (const edit of draftItemEdits) {
    const key = buildDraftEditKey(edit.goalId, edit.unitKey);
    const unit = unitByKey.get(key);
    if (!unit) {
      continue;
    }
    const nextScheduledDate = nextScheduledByKey.get(key) ?? unit.scheduledDate;
    if (nextScheduledDate !== unit.scheduledDate) {
      unit.scheduledDate = nextScheduledDate;
      unit.locked = true;
      draftMovedCount += 1;
    }
    if (edit.label !== null && edit.label !== unit.label) {
      unit.label = edit.label;
      draftRelabeledCount += 1;
    }
    if (edit.scheduledTimeOverride !== undefined) {
      unit.scheduledTimeOverride = edit.scheduledTimeOverride;
    }
  }
  for (const unit of workUnits) {
    const goalDefaultLocalTime =
      goalDefaultLocalTimeByGoalId.get(unit.originalGoalId) ??
      unit.goalDefaultLocalTime ??
      null;
    const resolvedTime = resolvePlannerEffectiveScheduledTime({
      scheduledDate: unit.scheduledDate,
      goalDefaultLocalTime,
      scheduledTimeOverride: unit.scheduledTimeOverride ?? null,
    });
    if (
      resolvedTime.goalDefaultLocalTime === null &&
      resolvedTime.scheduledTimeOverride === null &&
      resolvedTime.effectiveScheduledLocalTime === null
    ) {
      delete unit.goalDefaultLocalTime;
      delete unit.scheduledTimeOverride;
      delete unit.effectiveScheduledLocalTime;
      delete unit.effectiveScheduledAtLocal;
      continue;
    }
    if (resolvedTime.goalDefaultLocalTime === null) {
      delete unit.goalDefaultLocalTime;
    } else {
      unit.goalDefaultLocalTime = resolvedTime.goalDefaultLocalTime;
    }
    unit.scheduledTimeOverride = resolvedTime.scheduledTimeOverride;
    unit.effectiveScheduledLocalTime = resolvedTime.effectiveScheduledLocalTime;
    unit.effectiveScheduledAtLocal = resolvedTime.effectiveScheduledAtLocal;
  }

  let draftRetimedCount = 0;
  for (const unit of workUnits) {
    const key = buildDraftEditKey(unit.originalGoalId, unit.unitKey);
    const previous = priorEffectiveTimeByKey.get(key) ?? null;
    const current = unit.effectiveScheduledLocalTime ?? null;
    if (previous !== current) {
      draftRetimedCount += 1;
    }
  }

  return { workUnits, draftMovedCount, draftRelabeledCount, draftRetimedCount };
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
  draftCommands = [],
}: {
  scopeMonth: string;
  policy: PlannerPolicy;
  kernel: PlannerKernelOutput;
  snapshot: PlannerCanonicalSnapshot;
  assessments: GoalAssessment[];
  draftCommands?: PlannerDraftCommand[];
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
  const goalDefaultLocalTimeByGoalId = new Map(
    goals.map((goal) => [goal.id, goal.default_local_time ?? null])
  );

  const { draftItemEdits } = buildDraftItemEditsFromCommands(draftCommands);

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
  const originalScheduledDateByKey = new Map(
    kernel.workUnits.map((unit) => [
      buildDraftEditKey(unit.originalGoalId, unit.unitKey),
      unit.scheduledDate,
    ])
  );
  const {
    workUnits,
    draftMovedCount,
    draftRelabeledCount,
    draftRetimedCount,
  } = applyValidatedDraftItemEdits({
    scopeMonth,
    policy,
    kernelWorkUnits: kernel.workUnits,
    goalDefaultLocalTimeByGoalId,
    draftItemEdits,
    completions: snapshot.completions,
  });
  const unitsByDate = new Map<string, typeof workUnits>();
  for (const unit of workUnits) {
    if (!unit.scheduledDate) {
      continue;
    }
    const existing = unitsByDate.get(unit.scheduledDate) ?? [];
    existing.push(unit);
    unitsByDate.set(unit.scheduledDate, existing);
  }
  const scopeWindow = getScopeDateRange(scopeMonth);
  const dayDates = new Set(enumerateDates(scopeWindow));
  for (const scheduledDate of unitsByDate.keys()) {
    dayDates.add(scheduledDate);
  }
  const days = Array.from(dayDates)
    .sort()
    .map((date) => {
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
    const itemKey = buildDraftEditKey(unit.originalGoalId, unit.unitKey);
    const persistedPlacementWindow = mergePlacementAndDraftMoveWindow(
      unit.placementWindow,
      unit.draftMoveWindow
    );
    return {
      goal_id: unit.originalGoalId,
      unit_key: unit.unitKey,
      requirement_kind: unit.kind,
      ordinal: unit.ordinal,
      period_key: unit.periodKey,
      label: unit.label,
      credit_window_start: unit.creditWindow.start,
      credit_window_end: unit.creditWindow.end,
      placement_window_start: persistedPlacementWindow?.start ?? null,
      placement_window_end: persistedPlacementWindow?.end ?? null,
      classification: unit.classification,
      miss_policy: unit.missPolicy,
      rest_eligible: unit.restEligible,
      max_per_day: 1 as const,
      credited_completion_id: unit.creditedCompletionId,
      credited_completion_date: unit.creditedCompletionDate,
      credit_state: unit.creditState,
      original_scheduled_date:
        originalScheduledDateByKey.get(itemKey) ?? unit.scheduledDate,
      scheduled_date: unit.scheduledDate,
      scheduled_time_override: unit.scheduledTimeOverride ?? null,
      effective_scheduled_local_time: unit.effectiveScheduledLocalTime ?? null,
      effective_scheduled_at_local: unit.effectiveScheduledAtLocal ?? null,
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
      draftCommands: draftCommands.length,
      draftMoved: draftMovedCount,
      draftRelabeled: draftRelabeledCount,
      draftRetimed: draftRetimedCount,
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
    eligibilityMode: kernel.eligibilityMode,
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
