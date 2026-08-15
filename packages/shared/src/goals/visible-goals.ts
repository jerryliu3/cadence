/**
 * A teamed viewer can read their partner's personal goals through
 * `public.can_view_goal`, but those belong in the partner lane rather than the
 * viewer's own lists and summaries. Goals attached to one of the viewer's
 * teams remain actionable in the viewer lane regardless of which member
 * created them.
 *
 * Excluding only the partner's personal goals avoids silently dropping other
 * visible goal categories.
 */
export function selectViewerVisibleGoals<
  TGoal extends { owner_id: string; team_id?: string | null },
>({
  goals,
  partnerId,
  memberTeamIds = [],
}: {
  goals: TGoal[];
  partnerId?: string | null;
  memberTeamIds?: Iterable<string>;
}): TGoal[] {
  if (!partnerId) {
    return goals;
  }
  const teams = new Set(memberTeamIds);
  return goals.filter(
    (goal) =>
      goal.owner_id !== partnerId ||
      (goal.team_id != null && teams.has(goal.team_id))
  );
}

/** `undefined` keeps the request on the self path; a partner id opts into the partner path. */
export function progressSubjectUserId({
  targetIsViewer,
  targetSubjectUserId,
}: {
  targetIsViewer: boolean;
  targetSubjectUserId: string;
}): string | undefined {
  return targetIsViewer ? undefined : targetSubjectUserId;
}
