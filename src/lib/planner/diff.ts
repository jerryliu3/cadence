import type { PlannerIssueCode } from "@/lib/planner/solver/types";
import type { PlannerBaseAssignment } from "@/lib/planner/work-units";

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
      `${assignment.goalId}\u0000${assignment.requirementFingerprint}\u0000${assignment.unitKey}`,
      assignment,
    ])
  );
  const nextByKey = new Map(
    nextAssignments.map((assignment) => [
      `${assignment.goalId}\u0000${assignment.requirementFingerprint}\u0000${assignment.unitKey}`,
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
