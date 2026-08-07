import { compareCanonicalStrings } from "@/lib/planner/canonical";
import { compilePlannerPolicy, type PlannerPolicy } from "@/lib/planner/policy";
import type { CoachPolicyPatch } from "@/lib/planner/coach";

export interface ApplyCoachPolicyPatchesResult {
  policy: PlannerPolicy;
  appliedPatchCount: number;
  ignoredPatchCount: number;
  noOpPatchCount: number;
  outOfScopePatchCount: number;
  unsupportedPatchCount: number;
}

function dedupeWeekdays(weekdays: number[]) {
  return Array.from(new Set(weekdays)).sort((left, right) => left - right);
}

function sameNumberArray(left: number[] | undefined, right: number[]) {
  if (!left || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function normalizeMonthlyDistributionEntries(
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

function sameMonthlyDistribution(
  left: Array<{ month: string; count: number }> | undefined,
  right: Array<{ month: string; count: number }>
) {
  if (!left || left.length !== right.length) {
    return false;
  }
  return left.every(
    (entry, index) =>
      entry.month === right[index]?.month && entry.count === right[index]?.count
  );
}

function isAllowedGoalId(goalId: string | null, allowedGoalIds: Set<string>) {
  return goalId === null || allowedGoalIds.has(goalId);
}

export function applyCoachPolicyPatches({
  policy,
  patches,
  allowedGoalIds,
}: {
  policy: PlannerPolicy;
  patches: CoachPolicyPatch[];
  allowedGoalIds: Set<string>;
}): ApplyCoachPolicyPatchesResult {
  const nextPolicy = structuredClone(policy);
  let appliedPatchCount = 0;
  let ignoredPatchCount = 0;
  let noOpPatchCount = 0;
  let outOfScopePatchCount = 0;
  let unsupportedPatchCount = 0;

  for (const patch of patches) {
    switch (patch.kind) {
      case "set_rest_weekdays": {
        const normalized = dedupeWeekdays(patch.restWeekdays);
        if (sameNumberArray(nextPolicy.restWeekdays, normalized)) {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
          break;
        }
        nextPolicy.restWeekdays = normalized;
        appliedPatchCount += 1;
        break;
      }
      case "add_blackout_range": {
        const exists = nextPolicy.blackoutRanges.some(
          (range) => range.start === patch.start && range.end === patch.end
        );
        if (exists) {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
          break;
        }
        nextPolicy.blackoutRanges.push({
          start: patch.start,
          end: patch.end,
        });
        appliedPatchCount += 1;
        break;
      }
      case "remove_blackout_range": {
        const before = nextPolicy.blackoutRanges.length;
        nextPolicy.blackoutRanges = nextPolicy.blackoutRanges.filter(
          (range) => range.start !== patch.start || range.end !== patch.end
        );
        if (nextPolicy.blackoutRanges.length !== before) {
          appliedPatchCount += 1;
        } else {
          ignoredPatchCount += 1;
        }
        break;
      }
      case "set_goal_allowed_weekdays": {
        if (!allowedGoalIds.has(patch.goalId)) {
          ignoredPatchCount += 1;
          outOfScopePatchCount += 1;
          break;
        }
        const normalized = dedupeWeekdays(patch.weekdays);
        if (
          sameNumberArray(nextPolicy.goalAllowedWeekdays[patch.goalId], normalized)
        ) {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
          break;
        }
        nextPolicy.goalAllowedWeekdays[patch.goalId] = normalized;
        appliedPatchCount += 1;
        break;
      }
      case "clear_goal_allowed_weekdays": {
        if (!allowedGoalIds.has(patch.goalId)) {
          ignoredPatchCount += 1;
          outOfScopePatchCount += 1;
          break;
        }
        if (patch.goalId in nextPolicy.goalAllowedWeekdays) {
          delete nextPolicy.goalAllowedWeekdays[patch.goalId];
          appliedPatchCount += 1;
        } else {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
        }
        break;
      }
      case "set_goal_date_preference": {
        if (!isAllowedGoalId(patch.goalId, allowedGoalIds)) {
          ignoredPatchCount += 1;
          outOfScopePatchCount += 1;
          break;
        }
        const exists = nextPolicy.datePreferences.some(
          (preference) =>
            preference.goalId === patch.goalId &&
            preference.start === patch.start &&
            preference.end === patch.end &&
            preference.effect === patch.effect
        );
        if (!exists) {
          nextPolicy.datePreferences.push({
            goalId: patch.goalId,
            start: patch.start,
            end: patch.end,
            effect: patch.effect,
          });
          appliedPatchCount += 1;
        } else {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
        }
        break;
      }
      case "clear_goal_date_preference": {
        if (!isAllowedGoalId(patch.goalId, allowedGoalIds)) {
          ignoredPatchCount += 1;
          outOfScopePatchCount += 1;
          break;
        }
        const before = nextPolicy.datePreferences.length;
        nextPolicy.datePreferences = nextPolicy.datePreferences.filter(
          (preference) =>
            preference.goalId !== patch.goalId ||
            preference.start !== patch.start ||
            preference.end !== patch.end ||
            preference.effect !== patch.effect
        );
        if (nextPolicy.datePreferences.length !== before) {
          appliedPatchCount += 1;
        } else {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
        }
        break;
      }
      case "set_spacing_strategy": {
        if (nextPolicy.spacingStrategy === patch.spacingStrategy) {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
          break;
        }
        nextPolicy.spacingStrategy = patch.spacingStrategy;
        appliedPatchCount += 1;
        break;
      }
      case "set_goal_spacing_strategy": {
        if (!allowedGoalIds.has(patch.goalId)) {
          ignoredPatchCount += 1;
          outOfScopePatchCount += 1;
          break;
        }
        if (nextPolicy.goalSpacingStrategies[patch.goalId] === patch.spacingStrategy) {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
          break;
        }
        nextPolicy.goalSpacingStrategies[patch.goalId] = patch.spacingStrategy;
        appliedPatchCount += 1;
        break;
      }
      case "set_goal_monthly_distribution": {
        if (!allowedGoalIds.has(patch.goalId)) {
          ignoredPatchCount += 1;
          outOfScopePatchCount += 1;
          break;
        }
        const normalized = normalizeMonthlyDistributionEntries(
          patch.distribution
        );
        const current = nextPolicy.goalMonthlyDistributions?.[patch.goalId];
        if (normalized.length === 0) {
          if (nextPolicy.goalMonthlyDistributions?.[patch.goalId]) {
            delete nextPolicy.goalMonthlyDistributions[patch.goalId];
            appliedPatchCount += 1;
          } else {
            ignoredPatchCount += 1;
            noOpPatchCount += 1;
          }
          break;
        }
        if (sameMonthlyDistribution(current, normalized)) {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
          break;
        }
        if (!nextPolicy.goalMonthlyDistributions) {
          nextPolicy.goalMonthlyDistributions = {};
        }
        nextPolicy.goalMonthlyDistributions[patch.goalId] = normalized;
        appliedPatchCount += 1;
        break;
      }
      case "clear_goal_monthly_distribution": {
        if (!allowedGoalIds.has(patch.goalId)) {
          ignoredPatchCount += 1;
          outOfScopePatchCount += 1;
          break;
        }
        if (nextPolicy.goalMonthlyDistributions?.[patch.goalId]) {
          delete nextPolicy.goalMonthlyDistributions[patch.goalId];
          appliedPatchCount += 1;
        } else {
          ignoredPatchCount += 1;
          noOpPatchCount += 1;
        }
        break;
      }
      default: {
        ignoredPatchCount += 1;
        unsupportedPatchCount += 1;
        break;
      }
    }
  }

  return {
    policy: compilePlannerPolicy(nextPolicy).policy,
    appliedPatchCount,
    ignoredPatchCount,
    noOpPatchCount,
    outOfScopePatchCount,
    unsupportedPatchCount,
  };
}
