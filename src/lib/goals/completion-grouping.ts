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
