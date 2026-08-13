interface GoalIdentity {
  id: string;
  owner_id: string;
}

interface GoalParticipantIdentity {
  goal_id: string;
}

interface GoalScopedCompletion {
  goal_id: string;
}

export function buildCompletableGoalIds<
  TGoal extends GoalIdentity,
  TParticipant extends GoalParticipantIdentity
>({
  goals,
  participants,
  userId,
  restrictParticipantsToVisibleGoals = false,
}: {
  goals: TGoal[];
  participants: TParticipant[];
  userId: string;
  restrictParticipantsToVisibleGoals?: boolean;
}): Set<string> {
  const ids = new Set<string>();
  const visibleGoalIds = restrictParticipantsToVisibleGoals
    ? new Set(goals.map((goal) => goal.id))
    : null;

  for (const goal of goals) {
    if (goal.owner_id === userId) {
      ids.add(goal.id);
    }
  }

  for (const participant of participants) {
    if (!visibleGoalIds || visibleGoalIds.has(participant.goal_id)) {
      ids.add(participant.goal_id);
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
