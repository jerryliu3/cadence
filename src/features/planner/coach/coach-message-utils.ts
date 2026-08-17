import type { CoachPolicyMessageProposal } from "@/features/planner/calendar-surface.types";
import type { CoachPolicyPatch } from "@/lib/planner/coach";
import type { PlannerPolicy } from "@/lib/planner/policy";
import { dedupeWeekdays, weekStartOptions } from "@/lib/dates/weekday-options";
import {
  buildCoachBaselineSnapshotToken,
  buildCoachMessageProposal as buildSharedCoachMessageProposal,
  buildCoachProposalSignature,
} from "@cadence/shared/planner/coach-proposal";

const MAX_COACH_MESSAGE_CHARACTERS = 12_000;
const WEEKDAY_NAMES = weekStartOptions.map((option) => option.shortLabel);

export type CoachProposalAutoApplyStatus =
  | "not_attempted"
  | "applied"
  | "already_applied"
  | "failed";

function formatWeekdayList(weekdays: number[]) {
  const labels = dedupeWeekdays(weekdays)
    .map((weekday) => WEEKDAY_NAMES[weekday] ?? null)
    .filter((weekday): weekday is (typeof WEEKDAY_NAMES)[number] => weekday !== null);
  return labels.length > 0 ? labels.join(", ") : "none";
}

function describePolicyPatch(patch: CoachPolicyPatch) {
  switch (patch.kind) {
    case "set_rest_weekdays":
      return `Set rest weekdays to ${formatWeekdayList(patch.restWeekdays)}.`;
    case "add_blackout_range":
      return `Avoid scheduling between ${patch.start} and ${patch.end}.`;
    case "remove_blackout_range":
      return `Remove blackout dates from ${patch.start} to ${patch.end}.`;
    case "move_session":
      return `Move ${patch.unitKey} to ${patch.scheduledDate}.`;
  }
}

function clampAssistantMessage(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_COACH_MESSAGE_CHARACTERS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_COACH_MESSAGE_CHARACTERS - 1)}…`;
}

export function buildProposalSignature(patches: CoachPolicyPatch[]) {
  return buildCoachProposalSignature(patches);
}

export function buildBaselineSnapshotToken(policy: PlannerPolicy) {
  return buildCoachBaselineSnapshotToken(policy);
}

export function buildDurableApplyToastDetail({
  scopeMonth,
  includedDraftPolicyChanges,
}: {
  scopeMonth: string;
  includedDraftPolicyChanges: boolean;
}) {
  const draftNote = includedDraftPolicyChanges
    ? " This save also includes your current draft policy edits."
    : "";
  return `Saved as your default planner policy from ${scopeMonth}.${draftNote} Unpublished months will regenerate as you navigate; already-published months require republish to persist the new rhythm.`;
}

export function mapAutoApplyStatusToProposalStatus(
  status: CoachProposalAutoApplyStatus
): CoachPolicyMessageProposal["applyStatus"] {
  if (status === "applied" || status === "already_applied") {
    return "auto_applied";
  }
  return "not_applied";
}

export function buildCoachMessageProposal({
  policyPatches,
  unresolvedQuestions,
  baselinePolicy,
  autoApplyStatus,
  autoAppliedEntryKeys,
}: {
  policyPatches: CoachPolicyPatch[];
  unresolvedQuestions: string[];
  baselinePolicy: PlannerPolicy | null;
  autoApplyStatus: CoachProposalAutoApplyStatus;
  autoAppliedEntryKeys: string[];
}): CoachPolicyMessageProposal | null {
  return buildSharedCoachMessageProposal({
    baselinePolicy,
    policyPatches,
    unresolvedQuestions,
    applyStatus: mapAutoApplyStatusToProposalStatus(autoApplyStatus),
    appliedMoveEntryKeys: autoAppliedEntryKeys,
  }) as CoachPolicyMessageProposal | null;
}

export function buildAssistantMessage({
  reply,
  recommendations,
  warnings,
  unresolvedQuestions,
  policyPatches,
  autoApplyStatus,
}: {
  reply: string;
  recommendations: string[];
  warnings: string[];
  unresolvedQuestions: string[];
  policyPatches: CoachPolicyPatch[];
  autoApplyStatus: CoachProposalAutoApplyStatus;
}) {
  const lines: string[] = [reply.trim()];

  if (recommendations.length > 0) {
    lines.push("", "Recommended next actions:");
    for (const recommendation of recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  if (policyPatches.length > 0) {
    if (autoApplyStatus === "applied") {
      lines.push("", "Draft updates auto-applied:");
    } else if (autoApplyStatus === "already_applied") {
      lines.push("", "Draft updates already match your current policy:");
    } else if (autoApplyStatus === "failed") {
      lines.push("", "Draft updates proposed (auto-apply did not complete):");
    } else {
      lines.push("", "Draft updates proposed:");
    }
    for (const patch of policyPatches) {
      lines.push(`- ${describePolicyPatch(patch)}`);
    }
  }

  if (unresolvedQuestions.length > 0) {
    lines.push("", "Questions to confirm:");
    for (const question of unresolvedQuestions) {
      lines.push(`- ${question}`);
    }
  }

  if (warnings.length > 0) {
    lines.push("", "Notes:");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return clampAssistantMessage(lines.join("\n"));
}
