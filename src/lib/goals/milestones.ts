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
