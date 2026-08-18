import { describeLinkedTargetSuppression } from "@/features/planner/calendar-linked-targets";
import type { PlannerContextPayload } from "@/features/planner/calendar-surface.types";
import type { EligibilityReason } from "@/lib/planner/eligibility";

const SCOPE_ONLY_ELIGIBILITY_REASONS = new Set<EligibilityReason>([
  "end_outside_scope",
  "starts_after_scope",
]);

const NON_ACTIONABLE_ELIGIBILITY_REASONS = new Set<EligibilityReason>([
  "not_owner",
  "deleted",
  "archived",
]);

const ELIGIBILITY_REASON_GROUP_LABELS: Partial<Record<EligibilityReason, string>> = {
  invalid_date_range: "Goals with invalid date ranges",
  horizon_too_long: "Goals beyond the planning horizon",
};

const ELIGIBILITY_REASON_LABELS: Record<EligibilityReason, string> = {
  eligible: "This goal can be planned.",
  not_owner: "Only goals you own can be planned here.",
  deleted: "Deleted goals are excluded from planning.",
  archived: "Archived goals are excluded from planning.",
  linked_target:
    "Linked target goals can be hidden in months where linked source coverage is still active.",
  invalid_date_range: "The goal dates are invalid (start is after end).",
  end_outside_scope: "This goal ends before the selected planning month.",
  starts_after_scope: "This goal starts after the selected planning month.",
  horizon_too_long:
    "This goal deadline exceeds the 24-month planning horizon limit.",
};

export interface PlannerEligibilityNotice {
  goalId: string;
  goalTitle: string;
  reason: EligibilityReason;
  reasonCopy: string;
}

export interface PlannerEligibilityNoticeGroup {
  reason: EligibilityReason;
  heading: string;
  entries: PlannerEligibilityNotice[];
}

export interface PlannerEligibilityNotices {
  hardIneligible: PlannerEligibilityNotice[];
  groupedHardIneligible: PlannerEligibilityNoticeGroup[];
  linkedTargetCount: number;
  linkedTargetDetails: Array<{
    goalId: string;
    goalTitle: string;
    statusCopy: string;
    sourceGoalTitles: string[];
  }>;
}

function getEligibilityReasonLabel(reason: EligibilityReason) {
  return ELIGIBILITY_REASON_LABELS[reason];
}

export function selectPlannerEligibilityNotices({
  context,
  effectivePreview,
  month,
}: {
  context: PlannerContextPayload | null;
  effectivePreview: PlannerContextPayload["preview"] | null;
  month: string | null;
}): PlannerEligibilityNotices {
  const eligibilityEntries = effectivePreview?.eligibility ?? [];
  const scopeMonth = context?.scopeMonth ?? month ?? "1970-01";
  const { linkedTargetCount, linkedTargetDetails } = describeLinkedTargetSuppression({
    eligibility: eligibilityEntries,
    links: context?.links ?? [],
    goalTitles: context?.goalTitles ?? {},
    scopeMonth,
  });

  const hardIneligible: PlannerEligibilityNotice[] = [];
  for (const eligibilityEntry of eligibilityEntries) {
    if (eligibilityEntry.eligible) {
      continue;
    }
    if (SCOPE_ONLY_ELIGIBILITY_REASONS.has(eligibilityEntry.reason)) {
      continue;
    }
    if (eligibilityEntry.reason === "linked_target") {
      continue;
    }
    if (NON_ACTIONABLE_ELIGIBILITY_REASONS.has(eligibilityEntry.reason)) {
      continue;
    }
    hardIneligible.push({
      goalId: eligibilityEntry.goalId,
      goalTitle:
        context?.goalTitles?.[eligibilityEntry.goalId] ?? eligibilityEntry.goalId,
      reason: eligibilityEntry.reason,
      reasonCopy: getEligibilityReasonLabel(eligibilityEntry.reason),
    });
  }

  hardIneligible.sort((left, right) => left.goalTitle.localeCompare(right.goalTitle));

  const groupedHardIneligible = Array.from(
    hardIneligible.reduce(
      (accumulator, item) => {
        const existing = accumulator.get(item.reason) ?? [];
        existing.push(item);
        accumulator.set(item.reason, existing);
        return accumulator;
      },
      new Map<EligibilityReason, PlannerEligibilityNotice[]>()
    ).entries()
  )
    .map(([reason, entries]) => ({
      reason,
      heading: ELIGIBILITY_REASON_GROUP_LABELS[reason] ?? "Goals needing updates",
      entries,
    }))
    .sort((left, right) => left.heading.localeCompare(right.heading));

  return {
    hardIneligible,
    groupedHardIneligible,
    linkedTargetCount,
    linkedTargetDetails,
  };
}
