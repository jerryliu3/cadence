import { compilePlannerPolicy, type PlannerPolicy } from "@/lib/planner/policy";
import type { CoachPolicyPatch } from "@/lib/planner/coach";

export interface ApplyCoachPolicyPatchesResult {
  policy: PlannerPolicy;
  appliedPatchCount: number;
  ignoredPatchCount: number;
}

function dedupeWeekdays(weekdays: number[]) {
  return Array.from(new Set(weekdays)).sort((left, right) => left - right);
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

  for (const patch of patches) {
    switch (patch.kind) {
      case "set_rest_weekdays": {
        nextPolicy.restWeekdays = dedupeWeekdays(patch.restWeekdays);
        appliedPatchCount += 1;
        break;
      }
      case "add_blackout_range": {
        const exists = nextPolicy.blackoutRanges.some(
          (range) => range.start === patch.start && range.end === patch.end
        );
        if (!exists) {
          nextPolicy.blackoutRanges.push({
            start: patch.start,
            end: patch.end,
          });
        }
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
          break;
        }
        nextPolicy.goalAllowedWeekdays[patch.goalId] = dedupeWeekdays(
          patch.weekdays
        );
        appliedPatchCount += 1;
        break;
      }
      case "clear_goal_allowed_weekdays": {
        if (!allowedGoalIds.has(patch.goalId)) {
          ignoredPatchCount += 1;
          break;
        }
        if (patch.goalId in nextPolicy.goalAllowedWeekdays) {
          delete nextPolicy.goalAllowedWeekdays[patch.goalId];
          appliedPatchCount += 1;
        } else {
          ignoredPatchCount += 1;
        }
        break;
      }
      case "set_goal_date_preference": {
        if (!isAllowedGoalId(patch.goalId, allowedGoalIds)) {
          ignoredPatchCount += 1;
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
        }
        appliedPatchCount += 1;
        break;
      }
      case "clear_goal_date_preference": {
        if (!isAllowedGoalId(patch.goalId, allowedGoalIds)) {
          ignoredPatchCount += 1;
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
        }
        break;
      }
      case "set_spacing_strategy": {
        nextPolicy.spacingStrategy = patch.spacingStrategy;
        appliedPatchCount += 1;
        break;
      }
      case "set_goal_spacing_strategy": {
        if (!allowedGoalIds.has(patch.goalId)) {
          ignoredPatchCount += 1;
          break;
        }
        nextPolicy.goalSpacingStrategies[patch.goalId] = patch.spacingStrategy;
        appliedPatchCount += 1;
        break;
      }
      default: {
        ignoredPatchCount += 1;
        break;
      }
    }
  }

  return {
    policy: compilePlannerPolicy(nextPolicy).policy,
    appliedPatchCount,
    ignoredPatchCount,
  };
}
