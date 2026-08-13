interface GoalIdentity {
  id: string;
  owner_id: string;
  team_id?: string | null;
}

interface GoalScopedCompletion {
  goal_id: string;
}

export function buildCompletableGoalIds<TGoal extends GoalIdentity>({
  goals,
  userId,
  memberTeamIds = [],
}: {
  goals: TGoal[];
  userId: string;
  memberTeamIds?: Iterable<string>;
}): Set<string> {
  const ids = new Set<string>();
  const teams = new Set(memberTeamIds);

  for (const goal of goals) {
    if (goal.owner_id === userId) {
      ids.add(goal.id);
      continue;
    }
    if (goal.team_id && teams.has(goal.team_id)) {
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
