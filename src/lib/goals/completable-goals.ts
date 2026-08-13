interface GoalIdentity {
  id: string;
  owner_id: string;
}

interface GoalScopedCompletion {
  goal_id: string;
}

export function buildCompletableGoalIds<TGoal extends GoalIdentity>({
  goals,
  userId,
}: {
  goals: TGoal[];
  userId: string;
}): Set<string> {
  const ids = new Set<string>();
  for (const goal of goals) {
    if (goal.owner_id === userId) {
      ids.add(goal.id);
    }
  }
  return ids;
}

export function selectCompletableGoals<TGoal extends GoalIdentity>(
  goals: TGoal[],
  completableGoalIds: Set<string>
): TGoal[] {
  return goals.filter((goal) => completableGoalIds.has(goal.id));
}

export function filterCompletionsForGoalIds<TCompletion extends GoalScopedCompletion>(
  completions: TCompletion[],
  completableGoalIds: Set<string>
): TCompletion[] {
  return completions.filter((completion) =>
    completableGoalIds.has(completion.goal_id)
  );
}
