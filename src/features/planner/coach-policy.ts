import { compilePlannerPolicy, type PlannerPolicy } from "@/lib/planner/policy";
import type { CoachPolicyPatch } from "@/lib/planner/coach";
import { dedupeWeekdays } from "@/lib/dates/weekday-options";

export interface ApplyCoachPolicyPatchesResult {
  policy: PlannerPolicy;
  /**
   * Disjoint buckets, so a caller can explain a proposal without double
   * counting: applied + noOp + ignored + unsupported === patches.length.
   */
  appliedPatchCount: number;
  /** Understood, but the policy already said this. */
  noOpPatchCount: number;
  /** Understood, but changed nothing (e.g. removing a range not present). */
  ignoredPatchCount: number;
  unsupportedPatchCount: number;
}

function sameNumberArray(left: number[] | undefined, right: number[]) {
  if (!left || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export function applyCoachPolicyPatches({
  policy,
  patches,
}: {
  policy: PlannerPolicy;
  patches: CoachPolicyPatch[];
}): ApplyCoachPolicyPatchesResult {
  const nextPolicy = structuredClone(policy);
  let appliedPatchCount = 0;
  let ignoredPatchCount = 0;
  let noOpPatchCount = 0;
  let unsupportedPatchCount = 0;

  for (const patch of patches) {
    switch (patch.kind) {
      case "set_rest_weekdays": {
        const normalized = dedupeWeekdays(patch.restWeekdays);
        if (sameNumberArray(nextPolicy.restWeekdays, normalized)) {
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
      case "move_session": {
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
    unsupportedPatchCount,
  };
}
