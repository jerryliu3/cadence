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

export type ChallengeStatus = "draft" | "scheduled" | "active" | "closed" | "archived";
export type ChallengeEnrollment = "auto" | "opt_in";
export type SocialSubjectKind = "user" | "duo";
export type ChallengeMetric =
  | "total_xp"
  | "category_xp"
  | "completions_count"
  | "distinct_active_days"
  | "max_streak_days";

export interface SocialChallenge {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: ChallengeStatus;
  enrollment: ChallengeEnrollment;
  subjectKind: SocialSubjectKind;
  metric: ChallengeMetric;
  metricTrackKey: string | null;
  targetValue: number;
  startsAt: string;
  endsAt: string;
  rewardXp: number;
  maxParticipants: number | null;
  participantCount: number;
  viewerJoined: boolean;
  viewerProgress: number | null;
  viewerCompletedAt: string | null;
  viewerAwardedAt: string | null;
}
