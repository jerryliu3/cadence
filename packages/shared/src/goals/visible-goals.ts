/**
 * A teamed viewer can read their partner's personal goals through
 * `public.can_view_goal`, but those belong in the partner lane rather than the
 * viewer's own lists and summaries.
 *
 * Excluding by owner is deliberate. Allow-listing what the viewer may see
 * (owned, shared, team-owned, ...) silently drops any category the list
 * forgets; excluding the one owner we know to be the partner cannot.
 */
export function selectViewerVisibleGoals<TGoal extends { owner_id: string }>({
  goals,
  partnerId,
}: {
  goals: TGoal[];
  partnerId?: string | null;
}): TGoal[] {
  if (!partnerId) {
    return goals;
  }
  return goals.filter((goal) => goal.owner_id !== partnerId);
}
