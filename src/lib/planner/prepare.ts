import { getAnchoredPeriod } from "@/lib/goals/periods";
import { getAdmissibleCompletions } from "@/lib/goals/admissible";
import type { Completion, Goal } from "@/lib/goals/types";
import { reportError } from "@/lib/observability/report-error";
import { createDefaultAssessment } from "@/lib/planner/assessment";
import {
  resolveCanonicalAsOfDate,
  PlannerRouteError,
} from "@/lib/planner/api";
import {
  PLANNER_CONTRACT_VERSION,
  PLANNER_ELIGIBILITY_MODES,
} from "@/lib/planner/contracts/bounds";
import {
  loadPlannerContextPayload,
  loadPlannerPreparationSnapshot,
  type PlannerItemRow,
} from "@/lib/planner/context-loader";
import { enumerateDates } from "@/lib/planner/dates";
import { runPlannerKernel } from "@/lib/planner/kernel";
import { postgresErrorMatches } from "@/lib/planner/postgres-errors";
import {
  createDefaultPlannerPolicy,
  plannerPolicySchema,
} from "@/lib/planner/policy";
import {
  buildGoalPreparationWindows,
  buildPreparationWindows,
} from "@/lib/planner/preparation-windows";
import {
  evaluateGoalEligibility,
  resolveGoalLinkRole,
} from "@/lib/planner/eligibility";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";
import {
  buildPlannerGoalLockSignature,
  isPlannerGoalUnplaceableReason,
  isPlannerGoalUnplaceableRecordValid,
  type PlannerGoalUnplaceableRecord,
  type PlannerGoalUnplaceableReason,
} from "@/lib/planner/unplaceable";
import type { Json } from "@/lib/supabase/database.types";
import type { createClient as createServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

interface PreparationWindow {
  start: string;
  end: string;
}

interface PreparedItem {
  goal_id: string;
  unit_key: string;
  scheduled_date: string;
  original_scheduled_date: string;
  scheduled_time: string | null;
  locked: boolean;
}

interface GoalUnplaceablePayload {
  goal_id: string;
  requirement_fingerprint: string;
  policy_revision: number;
  lock_signature: string;
  effective_span_end: string;
  unplaced_count: number;
  reason: PlannerGoalUnplaceableReason;
}

interface PersistedCompletionCreditItem {
  unit_key: string;
  scheduled_date: string;
}

function itemKey(item: { goal_id: string; unit_key: string }) {
  return `${item.goal_id}\u0000${item.unit_key}`;
}

function itemMatchesCurrentRequirement({
  item,
  goal,
  weekStartsOn,
}: {
  item: PlannerItemRow;
  goal: Goal;
  weekStartsOn: number;
}) {
  if (
    item.scheduled_date < goal.start_date ||
    (goal.end_date !== null && item.scheduled_date > goal.end_date)
  ) {
    return false;
  }
  const requirement = normalizeGoalRequirement(goal).requirement;
  if (requirement.kind === "milestone_sequence") {
    const match = /^milestone:([1-9][0-9]*)$/.exec(item.unit_key);
    return Boolean(match && Number(match[1]) <= requirement.targetCount);
  }
  if (requirement.kind === "deadline_total") {
    const match = /^total:([1-9][0-9]*)$/.exec(item.unit_key);
    return Boolean(match && Number(match[1]) <= requirement.targetCount);
  }
  const period = getAnchoredPeriod(
    goal.start_date,
    requirement.interval,
    item.scheduled_date,
    { weekStartsOn }
  );
  return item.unit_key === `cadence:${period.periodKey}`;
}

function computeRequiredUnitKeys({
  goal,
  effectiveStart,
  effectiveEnd,
  weekStartsOn,
}: {
  goal: Goal;
  effectiveStart: string;
  effectiveEnd: string;
  weekStartsOn: number;
}) {
  if (effectiveEnd < effectiveStart) {
    return new Set<string>();
  }
  const requirement = normalizeGoalRequirement(goal).requirement;
  if (requirement.kind === "milestone_sequence") {
    return new Set(
      Array.from(
        { length: requirement.targetCount },
        (_, index) => `milestone:${index + 1}`
      )
    );
  }
  if (requirement.kind === "deadline_total") {
    return new Set(
      Array.from(
        { length: requirement.targetCount },
        (_, index) => `total:${index + 1}`
      )
    );
  }
  const requiredUnitKeys = new Set<string>();
  for (const date of enumerateDates({ start: effectiveStart, end: effectiveEnd })) {
    const period = getAnchoredPeriod(
      goal.start_date,
      requirement.interval,
      date,
      { weekStartsOn }
    );
    requiredUnitKeys.add(`cadence:${period.periodKey}`);
  }
  return requiredUnitKeys;
}

export function computeCompletionCreditedUnitKeys({
  goal,
  completions,
  asOfDate,
  weekStartsOn,
  requiredUnitKeys,
  persistedItems,
}: {
  goal: Goal;
  completions: Completion[];
  asOfDate: string;
  weekStartsOn: number;
  requiredUnitKeys: Set<string>;
  persistedItems: PersistedCompletionCreditItem[];
}) {
  if (requiredUnitKeys.size === 0 || completions.length === 0) {
    return new Set<string>();
  }

  const admissible = getAdmissibleCompletions(goal, completions, {
    asOfDate,
  });
  if (admissible.length === 0) {
    return new Set<string>();
  }

  const requirement = normalizeGoalRequirement(goal).requirement;
  if (requirement.kind === "cadence") {
    const creditedCadenceUnits = new Set<string>();
    for (const completion of admissible) {
      const period = getAnchoredPeriod(
        goal.start_date,
        requirement.interval,
        completion.completed_on,
        { weekStartsOn }
      );
      const unitKey = `cadence:${period.periodKey}`;
      if (requiredUnitKeys.has(unitKey)) {
        creditedCadenceUnits.add(unitKey);
      }
    }
    return creditedCadenceUnits;
  }

  if (requirement.kind === "deadline_total") {
    // Mirror reconciliation's deadline-total credit ordering:
    // scheduled-date matches first, then chronological fallback.
    const usedCompletionIds = new Set<string>();
    const creditedUnitKeys = new Set<string>();
    const admissibleByDate = new Map<string, Completion>();
    for (const completion of admissible) {
      admissibleByDate.set(completion.completed_on, completion);
    }
    const scheduledDateByUnitKey = new Map(
      persistedItems.map((item) => [item.unit_key, item.scheduled_date] as const)
    );
    const orderedUnitKeys = Array.from(
      { length: requirement.targetCount },
      (_, index) => `total:${index + 1}`
    );

    for (const unitKey of orderedUnitKeys) {
      if (!requiredUnitKeys.has(unitKey)) {
        continue;
      }
      const scheduledDate = scheduledDateByUnitKey.get(unitKey);
      if (!scheduledDate) {
        continue;
      }
      const available = admissibleByDate.get(scheduledDate);
      if (available) {
        usedCompletionIds.add(available.id);
        creditedUnitKeys.add(unitKey);
      }
    }

    let admissibleIndex = 0;
    for (const unitKey of orderedUnitKeys) {
      if (!requiredUnitKeys.has(unitKey) || creditedUnitKeys.has(unitKey)) {
        continue;
      }
      while (
        admissibleIndex < admissible.length &&
        usedCompletionIds.has(admissible[admissibleIndex]!.id)
      ) {
        admissibleIndex += 1;
      }
      const nextCompletion = admissible[admissibleIndex];
      if (!nextCompletion) {
        break;
      }
      usedCompletionIds.add(nextCompletion.id);
      creditedUnitKeys.add(unitKey);
      admissibleIndex += 1;
    }

    return creditedUnitKeys;
  }

  const creditedCount = Math.min(admissible.length, requirement.targetCount);
  return new Set(
    Array.from({ length: creditedCount }, (_, index) => `milestone:${index + 1}`).filter(
      (unitKey) => requiredUnitKeys.has(unitKey)
    )
  );
}

function throwPrepareInvariant({
  code,
  message,
  details,
}: {
  code: string;
  message: string;
  details: Record<string, unknown>;
}): never {
  const error = new PlannerRouteError(500, "invariant_failed", message, {
    code,
    ...details,
  });
  reportError(error, {
    scope: "planner.prepare",
    code,
    ...details,
  });
  throw error;
}

async function prepareOnce({
  supabase,
  ownerId,
}: {
  supabase: ServerSupabaseClient;
  ownerId: string;
}) {
  const preparation = await loadPlannerPreparationSnapshot({
    supabase,
    ownerId,
  });
  const timezone = preparation.snapshot.preferences?.timezone ?? "UTC";
  const asOfDate = resolveCanonicalAsOfDate({ timezone });
  const policy = plannerPolicySchema.parse(
    preparation.snapshot.preferences?.default_policy ??
      createDefaultPlannerPolicy(timezone, new Date().toISOString())
  );
  const windows = buildPreparationWindows(asOfDate);
  const preparationStart = windows[0]!.start;
  const preparationEnd = windows.at(-1)!.end;
  const policyRevision = preparation.snapshot.preferences?.policy_revision ?? 0;
  const goalById = new Map(
    preparation.snapshot.goals.map((goal) => [goal.id, goal])
  );
  const completionsByGoalId = new Map<string, Completion[]>();
  for (const completion of preparation.snapshot.completions) {
    const entries = completionsByGoalId.get(completion.goal_id) ?? [];
    entries.push(completion);
    completionsByGoalId.set(completion.goal_id, entries);
  }
  const persistedItemsInHorizon = preparation.persistedItems.filter(
    (item) =>
      item.scheduled_date >= preparationStart &&
      item.scheduled_date <= preparationEnd
  );
  const persistedItemsInHorizonByGoalId = new Map<string, PlannerItemRow[]>();
  const persistedItemsInHorizonValidByGoalId = new Map<string, PlannerItemRow[]>();
  const persistedItemsValidByGoalId = new Map<string, PlannerItemRow[]>();
  const validIdentityKeys = new Set<string>();
  const existingByKey = new Map<string, PlannerItemRow>();
  for (const item of preparation.persistedItems) {
    const goal = goalById.get(item.goal_id);
    if (
      goal &&
      itemMatchesCurrentRequirement({
        item,
        goal,
        weekStartsOn: policy.weekStartsOn ?? 1,
      })
    ) {
      const validItemsForGoal = persistedItemsValidByGoalId.get(item.goal_id) ?? [];
      validItemsForGoal.push(item);
      persistedItemsValidByGoalId.set(item.goal_id, validItemsForGoal);
      validIdentityKeys.add(itemKey(item));
    }
  }
  for (const item of persistedItemsInHorizon) {
    const itemsForGoal = persistedItemsInHorizonByGoalId.get(item.goal_id) ?? [];
    itemsForGoal.push(item);
    persistedItemsInHorizonByGoalId.set(item.goal_id, itemsForGoal);

    if (validIdentityKeys.has(itemKey(item))) {
      existingByKey.set(itemKey(item), item);
      const validItemsForGoal =
        persistedItemsInHorizonValidByGoalId.get(item.goal_id) ?? [];
      validItemsForGoal.push(item);
      persistedItemsInHorizonValidByGoalId.set(item.goal_id, validItemsForGoal);
    }
  }
  const completionToUnit = {};
  const generatedByKey = new Map<
    string,
    {
      goalId: string;
      unitKey: string;
      scheduledDate: string;
      scheduledTimeOverride: string | null;
      locked: boolean;
    }
  >();
  const goalOutcomeByGoalId = new Map<string, GoalUnplaceablePayload>();
  const precheckCompletionCreditedUnitKeysByGoalId = new Map<string, Set<string>>();
  const kernelCompletionCreditedUnitKeysByGoalId = new Map<string, Set<string>>();
  const kernelResolvedGoalIds = new Set<string>();
  const eligibleGoalIds = new Set<string>();
  const preserveRecordedOutcomeGoalIds = new Set<string>();
  const validUnplaceableRecordByGoalId = new Map<string, PlannerGoalUnplaceableRecord>(
    ((preparation.unplaceableGoals ?? []) as PlannerGoalUnplaceableRecord[]).flatMap(
      (record) =>
        isPlannerGoalUnplaceableReason(record.reason)
          ? [[record.goalId, record] as const]
          : []
    )
  );

  for (const goal of preparation.snapshot.goals) {
    const eligibilityDecision = evaluateGoalEligibility({
      window: { start: preparationStart, end: preparationEnd },
      ownerId,
      goal,
      asOfDate,
      currentLinkRole: resolveGoalLinkRole(goal.id, preparation.snapshot.links),
    });
    if (!eligibilityDecision.eligible) {
      const ineligibleGoalWindowsState = buildGoalPreparationWindows({
        goal,
        asOfDate,
        preparationStart,
        preparationEnd,
      });
      goalOutcomeByGoalId.set(goal.id, {
        goal_id: goal.id,
        requirement_fingerprint: normalizeGoalRequirement(goal).requirementFingerprint,
        policy_revision: policyRevision,
        lock_signature: buildPlannerGoalLockSignature(
          (persistedItemsInHorizonByGoalId.get(goal.id) ?? []).map((item) => ({
            unitKey: item.unit_key,
            scheduledDate: item.scheduled_date,
            locked: item.locked,
          }))
        ),
        effective_span_end: ineligibleGoalWindowsState.effectiveEnd,
        unplaced_count: 0,
        reason: "capacity",
      });
      continue;
    }
    eligibleGoalIds.add(goal.id);

    const normalizedRequirement = normalizeGoalRequirement(goal);
    const requirementFingerprint = normalizedRequirement.requirementFingerprint;
    const goalAssignments = preparation.persistedItems
      .filter((item) => item.goal_id === goal.id)
      .map((item) => ({
        goalId: goal.id,
        requirementFingerprint,
        unitKey: item.unit_key,
        scheduledDate: item.scheduled_date,
        locked: item.locked,
        scheduledTimeOverride: item.scheduled_time,
      }));
    // This pre-check uses requirement-valid persisted identities only, while the
    // kernel receives all persisted base assignments (including stale rows) so it
    // can reconcile and clear them during preparation.
    const goalWindowsState = buildGoalPreparationWindows({
      goal,
      asOfDate,
      preparationStart,
      preparationEnd,
    });
    const lockSignature = buildPlannerGoalLockSignature(
      (persistedItemsInHorizonByGoalId.get(goal.id) ?? []).map((item) => ({
        unitKey: item.unit_key,
        scheduledDate: item.scheduled_date,
        locked: item.locked,
      }))
    );
    const goalWindows = goalWindowsState.windows as PreparationWindow[];
    const requiredUnitKeys = computeRequiredUnitKeys({
      goal,
      effectiveStart: goalWindowsState.effectiveStart,
      effectiveEnd: goalWindowsState.effectiveEnd,
      weekStartsOn: policy.weekStartsOn ?? 1,
    });
    const completionCreditedUnitKeys = computeCompletionCreditedUnitKeys({
      goal,
      completions: completionsByGoalId.get(goal.id) ?? [],
      asOfDate,
      weekStartsOn: policy.weekStartsOn ?? 1,
      requiredUnitKeys,
      persistedItems: persistedItemsValidByGoalId.get(goal.id) ?? [],
    });
    precheckCompletionCreditedUnitKeysByGoalId.set(goal.id, completionCreditedUnitKeys);
    const persistedUnitKeys = new Set(
      (persistedItemsValidByGoalId.get(goal.id) ?? []).map((item) => item.unit_key)
    );
    const resolvedUnitKeys = new Set([
      ...persistedUnitKeys,
      ...completionCreditedUnitKeys,
    ]);
    const missingRequiredUnitCount = Array.from(requiredUnitKeys).filter(
      (unitKey) => !resolvedUnitKeys.has(unitKey)
    ).length;
    const hasStalePersistedRows =
      (persistedItemsInHorizonByGoalId.get(goal.id)?.length ?? 0) !==
      (persistedItemsInHorizonValidByGoalId.get(goal.id)?.length ?? 0);
    const existingUnplaceableRecord =
      validUnplaceableRecordByGoalId.get(goal.id) ?? null;
    const existingRecordIsValid =
      existingUnplaceableRecord !== null &&
      isPlannerGoalUnplaceableRecordValid({
        record: existingUnplaceableRecord,
        goal,
        policyRevision,
        lockSignature,
        preparationEnd,
      });
    const accountedCount =
      existingRecordIsValid && existingUnplaceableRecord
        ? existingUnplaceableRecord.unplacedCount
        : 0;
    const missingCount = missingRequiredUnitCount - accountedCount;
    const goalNeedsPreparation = missingCount !== 0 || hasStalePersistedRows;
    if (!goalNeedsPreparation) {
      if (
        existingRecordIsValid &&
        existingUnplaceableRecord &&
        existingUnplaceableRecord.unplacedCount > 0
      ) {
        goalOutcomeByGoalId.set(goal.id, {
          goal_id: goal.id,
          requirement_fingerprint: existingUnplaceableRecord.requirementFingerprint,
          policy_revision: existingUnplaceableRecord.policyRevision,
          lock_signature: lockSignature,
          effective_span_end: existingUnplaceableRecord.effectiveSpanEnd,
          unplaced_count: existingUnplaceableRecord.unplacedCount,
          reason: existingUnplaceableRecord.reason,
        });
        preserveRecordedOutcomeGoalIds.add(goal.id);
      } else {
        goalOutcomeByGoalId.set(goal.id, {
          goal_id: goal.id,
          requirement_fingerprint: requirementFingerprint,
          policy_revision: policyRevision,
          lock_signature: lockSignature,
          effective_span_end: goalWindowsState.effectiveEnd,
          unplaced_count: 0,
          reason: "capacity",
        });
      }
      continue;
    }

    if (goalWindows.length === 0) {
      goalOutcomeByGoalId.set(goal.id, {
        goal_id: goal.id,
        requirement_fingerprint: requirementFingerprint,
        policy_revision: policyRevision,
        lock_signature: lockSignature,
        effective_span_end: goalWindowsState.effectiveEnd,
        unplaced_count: 0,
        reason: "capacity",
      });
      continue;
    }

    const generatedForGoal = new Map<
      string,
      {
        goalId: string;
        unitKey: string;
        scheduledDate: string;
        scheduledTimeOverride: string | null;
        locked: boolean;
      }
    >();
    const goalDates = new Set<string>();
    let goalUnplaceableReason: PlannerGoalUnplaceableReason | null = null;
    let blockedByInvalidLock = false;
    for (const window of goalWindows) {
      const kernel = runPlannerKernel({
        schemaVersion: PLANNER_CONTRACT_VERSION,
        eligibilityMode: PLANNER_ELIGIBILITY_MODES[0],
        ownerId,
        startDate: window.start,
        endDate: window.end,
        asOfDate,
        timezone,
        goals: [goal],
        completions: preparation.snapshot.completions.filter(
          (completion) => completion.goal_id === goal.id
        ),
        links: preparation.snapshot.links.filter(
          (link) =>
            link.sourceGoalId === goal.id || link.targetGoalId === goal.id
        ),
        assessments: [createDefaultAssessment(goal)],
        policy,
        basePlan: {
          planId: "planner-preparation",
          version: 1,
          assignments: goalAssignments,
          completionToUnit,
          issueCodes: [],
        },
        preserveExistingAssignments: true,
      });
      if (kernel.validation.invariantViolations.length > 0) {
        throwPrepareInvariant({
          code: "invalid_kernel_output",
          message: "Planner prepare kernel output violated invariants.",
          details: {
            goalId: goal.id,
            invariantViolations: kernel.validation.invariantViolations,
          },
        });
      }
      const issueCodeSet = new Set(kernel.solver.issueCodes);
      if (issueCodeSet.has("invalid_lock")) {
        blockedByInvalidLock = true;
        goalUnplaceableReason = "invalid_lock";
        break;
      }
      if (!kernel.solver.publishable) {
        if (issueCodeSet.has("placement_shortfall")) {
          goalUnplaceableReason = "capacity";
        } else {
          throwPrepareInvariant({
            code: "unexpected_unpublishable",
            message: "Planner prepare reached an unexpected unpublishable state.",
            details: { goalId: goal.id, issueCodes: kernel.solver.issueCodes },
          });
        }
      }
      for (const unit of kernel.workUnits) {
        if (typeof unit.creditedCompletionDate === "string") {
          const creditedUnitKeys =
            kernelCompletionCreditedUnitKeysByGoalId.get(goal.id) ?? new Set<string>();
          creditedUnitKeys.add(unit.unitKey);
          kernelCompletionCreditedUnitKeysByGoalId.set(goal.id, creditedUnitKeys);
        }
        if (unit.scheduledDate !== null) {
          const goalDateKey = `${goal.id}\u0000${unit.scheduledDate}`;
          if (goalDates.has(goalDateKey)) {
            throwPrepareInvariant({
              code: "duplicate_goal_date",
              message:
                "Planner prepare produced duplicate same-goal same-day assignments.",
              details: {
                goalId: goal.id,
                unitKey: unit.unitKey,
                scheduledDate: unit.scheduledDate,
              },
            });
          }
          goalDates.add(goalDateKey);
        }
        if (
          unit.scheduledDate === null ||
          unit.scheduledDate < preparationStart ||
          unit.scheduledDate > preparationEnd
        ) {
          continue;
        }
        generatedForGoal.set(
          itemKey({ goal_id: unit.originalGoalId, unit_key: unit.unitKey }),
          {
            goalId: unit.originalGoalId,
            unitKey: unit.unitKey,
            scheduledDate: unit.scheduledDate,
            scheduledTimeOverride: unit.scheduledTimeOverride ?? null,
            locked: unit.locked,
          }
        );
      }
    }
    if (!blockedByInvalidLock) {
      kernelResolvedGoalIds.add(goal.id);
      for (const [key, generated] of generatedForGoal.entries()) {
        generatedByKey.set(key, generated);
      }
    }
    goalOutcomeByGoalId.set(goal.id, {
      goal_id: goal.id,
      requirement_fingerprint: requirementFingerprint,
      policy_revision: policyRevision,
      lock_signature: lockSignature,
      effective_span_end: goalWindowsState.effectiveEnd,
      unplaced_count: 0,
      reason: goalUnplaceableReason ?? "capacity",
    });
  }

  const preparedByKey = new Map<string, PreparedItem>(
    Array.from(existingByKey.entries()).map(([key, item]) => [
      key,
      {
        goal_id: item.goal_id,
        unit_key: item.unit_key,
        scheduled_date: item.scheduled_date,
        original_scheduled_date:
          item.original_scheduled_date ?? item.scheduled_date,
        scheduled_time: item.scheduled_time,
        locked: item.locked,
      },
    ])
  );
  for (const [key, generated] of generatedByKey) {
    const existing = existingByKey.get(key);
    preparedByKey.set(
      key,
      existing
        ? {
            goal_id: existing.goal_id,
            unit_key: existing.unit_key,
            scheduled_date: existing.scheduled_date,
            original_scheduled_date:
              existing.original_scheduled_date ?? existing.scheduled_date,
            scheduled_time: existing.scheduled_time,
            locked: existing.locked,
          }
        : {
            goal_id: generated.goalId,
            unit_key: generated.unitKey,
            scheduled_date: generated.scheduledDate,
            original_scheduled_date: generated.scheduledDate,
            scheduled_time: generated.scheduledTimeOverride,
            locked: generated.locked,
          }
    );
  }

  const preparedItems = Array.from(preparedByKey.values()).sort(
    (left, right) =>
      left.scheduled_date.localeCompare(right.scheduled_date) ||
      left.goal_id.localeCompare(right.goal_id) ||
      left.unit_key.localeCompare(right.unit_key)
  );
  const occupiedGoalDates = new Set<string>();
  for (const item of preparedItems) {
    const goalDate = `${item.goal_id}\u0000${item.scheduled_date}`;
    if (occupiedGoalDates.has(goalDate)) {
      throwPrepareInvariant({
        code: "duplicate_goal_date",
        message:
          "Planner prepare produced duplicate same-goal same-day assignments.",
        details: {
          goalId: item.goal_id,
          scheduledDate: item.scheduled_date,
        },
      });
    }
    occupiedGoalDates.add(goalDate);
  }

  for (const goal of preparation.snapshot.goals) {
    const preparedOutcome = goalOutcomeByGoalId.get(goal.id);
    if (!preparedOutcome) {
      continue;
    }
    if (!eligibleGoalIds.has(goal.id)) {
      preparedOutcome.unplaced_count = 0;
      preparedOutcome.reason = "capacity";
      continue;
    }
    if (preserveRecordedOutcomeGoalIds.has(goal.id)) {
      continue;
    }
    const span = buildGoalPreparationWindows({
      goal,
      asOfDate,
      preparationStart,
      preparationEnd,
    });
    const requiredUnitKeys = computeRequiredUnitKeys({
      goal,
      effectiveStart: span.effectiveStart,
      effectiveEnd: span.effectiveEnd,
      weekStartsOn: policy.weekStartsOn ?? 1,
    });
    const scheduledUnitKeys = new Set<string>();
    for (const item of persistedItemsValidByGoalId.get(goal.id) ?? []) {
      if (item.scheduled_date < preparationStart || item.scheduled_date > preparationEnd) {
        scheduledUnitKeys.add(item.unit_key);
      }
    }
    for (const item of preparedItems) {
      if (item.goal_id === goal.id) {
        scheduledUnitKeys.add(item.unit_key);
      }
    }
    const completionCreditedUnitKeys = kernelResolvedGoalIds.has(goal.id)
      ? (kernelCompletionCreditedUnitKeysByGoalId.get(goal.id) ?? new Set<string>())
      : (precheckCompletionCreditedUnitKeysByGoalId.get(goal.id) ?? new Set<string>());
    for (const unitKey of completionCreditedUnitKeys) {
      scheduledUnitKeys.add(unitKey);
    }
    const unresolvedCount = Array.from(requiredUnitKeys).filter(
      (unitKey) => !scheduledUnitKeys.has(unitKey)
    ).length;
    preparedOutcome.unplaced_count = unresolvedCount;
    if (unresolvedCount === 0) {
      preparedOutcome.reason = "capacity";
    }
  }

  const windowsPayload = windows.map((window) => ({
    start_date: window.start,
    end_date: window.end,
  })) as unknown as Json;
  const unplaceablePayload = Array.from(goalOutcomeByGoalId.values())
    .sort((left, right) => left.goal_id.localeCompare(right.goal_id))
    .map((outcome) => ({
      goal_id: outcome.goal_id,
      requirement_fingerprint: outcome.requirement_fingerprint,
      policy_revision: outcome.policy_revision,
      lock_signature: outcome.lock_signature,
      effective_span_end: outcome.effective_span_end,
      unplaced_count: outcome.unplaced_count,
      reason: outcome.reason,
    })) as unknown as Json;
  const expectedDigest = preparation.snapshot.revisions.scheduleDigest ?? "";
  const prepareScheduleRpcName =
    "prepare_planner_schedule" as Parameters<ServerSupabaseClient["rpc"]>[0];
  const response = await supabase.rpc(prepareScheduleRpcName, {
    p_windows: windowsPayload,
    p_items: preparedItems as unknown as Json,
    p_expected_digest: expectedDigest,
    p_unplaceable: unplaceablePayload,
  });
  if (response.error) {
    if (postgresErrorMatches(response.error, "P0001", "stale_schedule")) {
      return { stale: true as const };
    }
    throw new PlannerRouteError(
      409,
      "prepare_failed",
      "Planner calendar could not be prepared.",
      { cause: response.error.message }
    );
  }
  return { stale: false as const };
}

export async function preparePlannerSchedule({
  supabase,
  ownerId,
  capabilities = { crossMonthMovesEnabled: false },
  scopeMonth,
  visibleWindow,
  correlationId,
}: {
  supabase: ServerSupabaseClient;
  ownerId: string;
  capabilities?: { crossMonthMovesEnabled: boolean };
  scopeMonth: string;
  visibleWindow: PreparationWindow;
  correlationId?: string;
}) {
  let result = await prepareOnce({ supabase, ownerId });
  if (result.stale) {
    result = await prepareOnce({ supabase, ownerId });
  }
  if (result.stale) {
    throw new PlannerRouteError(
      409,
      "stale_revision",
      "Planner state changed while the calendar was opening. Try again."
    );
  }
  const payload = await loadPlannerContextPayload({
    supabase,
    ownerId,
    capabilities,
    scopeMonth,
    startDate: visibleWindow.start,
    endDate: visibleWindow.end,
    correlationId,
  });
  return payload;
}
