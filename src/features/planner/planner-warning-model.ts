import type { PlannerEligibilityNotices } from "@/features/planner/planner-eligibility-notices";

export type PlannerWarningSeverity = "none" | "informational" | "actionable";

export interface PlannerWarningModel {
  warningSuggestedNextSteps: string[];
  hasPlannerWarnings: boolean;
  plannerWarningSeverity: PlannerWarningSeverity;
  plannerWarningBannerCopy: string;
}

interface PlannerWarningModelArgs {
  unplaceableGoalCount: number;
  invalidLockGoalCount: number;
  capacityWarningGoalCount: number;
  eligibilityNotices: PlannerEligibilityNotices;
}

export function selectPlannerWarningModel({
  unplaceableGoalCount,
  invalidLockGoalCount,
  capacityWarningGoalCount,
  eligibilityNotices,
}: PlannerWarningModelArgs): PlannerWarningModel {
  const warningSuggestedNextSteps: string[] = [];
  if (invalidLockGoalCount > 0) {
    warningSuggestedNextSteps.push(
      "Unlock conflicting locked sessions and regenerate the calendar."
    );
  }
  if (capacityWarningGoalCount > 0) {
    warningSuggestedNextSteps.push(
      "Open planner settings to adjust targets, deadlines, or rest-day constraints."
    );
  }

  const hasPlannerWarnings =
    unplaceableGoalCount > 0 ||
    eligibilityNotices.hardIneligible.length > 0 ||
    eligibilityNotices.linkedTargetCount > 0;
  const plannerWarningSeverity: PlannerWarningSeverity = !hasPlannerWarnings
    ? "none"
    : unplaceableGoalCount > 0 || eligibilityNotices.hardIneligible.length > 0
      ? "actionable"
      : "informational";
  const plannerWarningBannerCopy =
    plannerWarningSeverity === "actionable"
      ? "Some goals need updates before the calendar can be fully scheduled."
      : `${eligibilityNotices.linkedTargetCount} linked main goal${
          eligibilityNotices.linkedTargetCount === 1 ? "" : "s"
        } ${
          eligibilityNotices.linkedTargetCount === 1 ? "is" : "are"
        } hidden this month while linked subgoals are still active.`;

  return {
    warningSuggestedNextSteps,
    hasPlannerWarnings,
    plannerWarningSeverity,
    plannerWarningBannerCopy,
  };
}
