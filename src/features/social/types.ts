export interface SocialFeedActor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface SocialFeedEvent {
  id: string;
  eventType:
    | "xp_earned"
    | "level_up"
    | "goal_achieved"
    | "challenge_completed"
    | "season_result"
    | "duo_formed";
  createdAt: string;
  actor: SocialFeedActor;
  trackKey: string | null;
  categoryLabel: string | null;
  goalTitle: string | null;
  xpDelta: number;
  occurrenceCount: number;
  reactionCount: number;
  viewerReacted: boolean;
  payload: Record<string, unknown>;
}
