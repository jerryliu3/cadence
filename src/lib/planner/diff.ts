import type { PlannerIssueCode } from "@/lib/planner/solver/types";
import type { PlannerBaseAssignment } from "@/lib/planner/work-units";
import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";

export interface PlanDiffEntry {
  kind:
    | "added"
    | "removed"
    | "moved"
    | "lock_changed"
    | "issue_added"
    | "issue_resolved";
  goalId: string | null;
  requirementFingerprint: string | null;
  unitKey: string | null;
  fromDate: string | null;
  toDate: string | null;
  issueCode: PlannerIssueCode | null;
}

export type PlannerDraftVisualKind = "moved_from" | "moved_to" | "new";

export interface PlannerDraftVisualDiffEntry {
  kind: PlannerDraftVisualKind;
  goalId: string;
  unitKey: string;
  date: string;
  counterpartDate: string | null;
}

function assignmentIdentityKey(input: {
  goalId: string;
  requirementFingerprint: string | null;
  unitKey: string;
}) {
  return `${input.goalId}\u0000${input.requirementFingerprint}\u0000${input.unitKey}`;
}

export function diffPlannerAssignments({
  baseAssignments,
  nextAssignments,
  baseIssues = [],
  nextIssues,
}: {
  baseAssignments: PlannerBaseAssignment[];
  nextAssignments: PlannerBaseAssignment[];
  baseIssues?: PlannerIssueCode[];
  nextIssues: PlannerIssueCode[];
}) {
  const baseByKey = new Map(
    baseAssignments.map((assignment) => [
      assignmentIdentityKey({
        goalId: assignment.goalId,
        requirementFingerprint: assignment.requirementFingerprint,
        unitKey: assignment.unitKey,
      }),
      assignment,
    ])
  );
  const nextByKey = new Map(
    nextAssignments.map((assignment) => [
      assignmentIdentityKey({
        goalId: assignment.goalId,
        requirementFingerprint: assignment.requirementFingerprint,
        unitKey: assignment.unitKey,
      }),
      assignment,
    ])
  );
  const diff: PlanDiffEntry[] = [];

  for (const key of Array.from(
    new Set([...baseByKey.keys(), ...nextByKey.keys()])
  ).sort()) {
    const base = baseByKey.get(key);
    const next = nextByKey.get(key);
    if (!base && next) {
      diff.push({
        kind: "added",
        goalId: next.goalId,
        requirementFingerprint: next.requirementFingerprint,
        unitKey: next.unitKey,
        fromDate: null,
        toDate: next.scheduledDate,
        issueCode: null,
      });
    } else if (base && !next) {
      diff.push({
        kind: "removed",
        goalId: base.goalId,
        requirementFingerprint: base.requirementFingerprint,
        unitKey: base.unitKey,
        fromDate: base.scheduledDate,
        toDate: null,
        issueCode: null,
      });
    } else if (base && next) {
      if (base.scheduledDate !== next.scheduledDate) {
        diff.push({
          kind: "moved",
          goalId: next.goalId,
          requirementFingerprint: next.requirementFingerprint,
          unitKey: next.unitKey,
          fromDate: base.scheduledDate,
          toDate: next.scheduledDate,
          issueCode: null,
        });
      }
      if (base.locked !== next.locked) {
        diff.push({
          kind: "lock_changed",
          goalId: next.goalId,
          requirementFingerprint: next.requirementFingerprint,
          unitKey: next.unitKey,
          fromDate: next.scheduledDate,
          toDate: next.scheduledDate,
          issueCode: null,
        });
      }
    }
  }

  for (const issue of nextIssues.filter(
    (candidate) => !baseIssues.includes(candidate)
  )) {
    diff.push({
      kind: "issue_added",
      goalId: null,
      requirementFingerprint: null,
      unitKey: null,
      fromDate: null,
      toDate: null,
      issueCode: issue,
    });
  }
  for (const issue of baseIssues.filter(
    (candidate) => !nextIssues.includes(candidate)
  )) {
    diff.push({
      kind: "issue_resolved",
      goalId: null,
      requirementFingerprint: null,
      unitKey: null,
      fromDate: null,
      toDate: null,
      issueCode: issue,
    });
  }
  return diff;
}

export function buildPlannerDraftVisualDiff(
  commands: readonly PlannerDraftCommand[]
) {
  const diff: PlannerDraftVisualDiffEntry[] = [];

  for (const command of commands) {
    if (
      command.kind !== "move_item" ||
      command.scheduledDate === command.sourceDate
    ) {
      continue;
    }
    diff.push({
      kind: "moved_from",
      goalId: command.goalId,
      unitKey: command.unitKey,
      date: command.sourceDate,
      counterpartDate: command.scheduledDate,
    });
    if (command.scheduledDate !== null) {
      diff.push({
        kind: "moved_to",
        goalId: command.goalId,
        unitKey: command.unitKey,
        date: command.scheduledDate,
        counterpartDate: command.sourceDate,
      });
    }
  }

  return diff.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date < right.date ? -1 : 1;
    }
    if (left.goalId !== right.goalId) {
      return left.goalId < right.goalId ? -1 : 1;
    }
    if (left.unitKey !== right.unitKey) {
      return left.unitKey < right.unitKey ? -1 : 1;
    }
    if (left.kind === right.kind) {
      return 0;
    }
    if (left.kind === "moved_from") {
      return -1;
    }
    if (right.kind === "moved_from") {
      return 1;
    }
    if (left.kind === "moved_to") {
      return -1;
    }
    return 1;
  });
}
