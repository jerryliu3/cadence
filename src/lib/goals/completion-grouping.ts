export function groupCompletionsByGoalId<T extends { goal_id: string }>(
  completions: T[]
) {
  const map = new Map<string, T[]>();
  completions.forEach((completion) => {
    const existing = map.get(completion.goal_id) ?? [];
    existing.push(completion);
    map.set(completion.goal_id, existing);
  });
  return map;
}

export function countCompletionsByDate<T extends { completed_on: string }>(
  completions: T[]
) {
  return completions.reduce<Record<string, number>>((accumulator, completion) => {
    accumulator[completion.completed_on] =
      (accumulator[completion.completed_on] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function getSortedCompletionDates<T extends { completed_on: string }>(
  completions: T[]
): string[] {
  return Array.from(
    new Set(completions.map((completion) => completion.completed_on))
  ).sort((left, right) => left.localeCompare(right));
}
