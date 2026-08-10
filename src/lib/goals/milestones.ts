import type { Goal } from "@/lib/goals/types";

export function defaultMilestoneName(index: number): string {
  return `Milestone ${index + 1}`;
}

export function buildMilestoneNameDrafts(count: number, existing: string[] = []): string[] {
  if (!Number.isFinite(count) || count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => existing[index] ?? "");
}

export function normalizeMilestoneNamesForSave(count: number, names: string[]): string[] {
  const safeCount = Math.max(count, 0);
  return Array.from({ length: safeCount }, (_, index) => {
    const value = names[index]?.trim();
    return value && value.length > 0 ? value : defaultMilestoneName(index);
  });
}

export function buildMilestoneNames(
  targetCount: number,
  names: string[] | null | undefined
): string[] {
  const safeTarget = Math.max(targetCount, 1);
  return Array.from({ length: safeTarget }, (_, index) => {
    const value = names?.[index]?.trim();
    return value && value.length > 0 ? value : defaultMilestoneName(index);
  });
}

export function areMilestoneNamesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((name, index) => name === right[index]);
}

export function getNextMilestoneName(
  goal: Pick<Goal, "frequency_type" | "target_count" | "milestone_names">,
  completionCount: number
): string | null {
  if (goal.frequency_type !== "fixed_milestones") {
    return null;
  }

  const targetCount = goal.target_count ?? 0;
  if (targetCount <= 0 || completionCount >= targetCount) {
    return null;
  }

  const nextMilestoneIndex = completionCount;
  const customName = goal.milestone_names?.[nextMilestoneIndex]?.trim();
  if (customName && customName.length > 0) {
    return customName;
  }

  return defaultMilestoneName(nextMilestoneIndex);
}
