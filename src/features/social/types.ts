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
    | "team_formed";
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
export type SocialSubjectKind = "user" | "team";
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

export type LeaderboardSeasonStatus = "upcoming" | "open" | "closed";
export type LeaderboardRollover = "none" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface LeaderboardSeason {
  id: string;
  slug: string;
  title: string;
  subjectKind: SocialSubjectKind;
  metric: ChallengeMetric;
  metricTrackKey: string | null;
  startsAt: string;
  endsAt: string | null;
  status: LeaderboardSeasonStatus;
  rollover: LeaderboardRollover;
}

export interface LeaderboardStanding {
  seasonId: string;
  subjectKind: SocialSubjectKind;
  subjectId: string;
  displayName: string;
  score: number;
  rank: number;
  tieBreakAt: string | null;
  viewerRank: number | null;
}

export type TeamStatus =
  | "pending"
  | "active"
  | "closed";

export interface TeamStateRow {
  teamId: string;
  status: TeamStatus;
  partnerId: string;
  partnerUsername: string | null;
  partnerDisplayName: string | null;
  partnerAvatarUrl: string | null;
  inviteMessage: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  isIncoming: boolean;
}
