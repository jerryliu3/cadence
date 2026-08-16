import type { LeaderboardSeason, SocialChallenge } from "@/features/social/types";
import type { Database } from "@/lib/supabase/database.types";

type SocialChallengeRow =
  | Database["public"]["Functions"]["get_social_challenges"]["Returns"][number]
  | Database["public"]["Functions"]["get_challenge_detail"]["Returns"][number];
type SocialSeasonRow =
  | Database["public"]["Functions"]["get_social_leaderboards"]["Returns"][number]
  | Database["public"]["Functions"]["get_social_leaderboard_season"]["Returns"][number];

export function toChallengeDto(row: SocialChallengeRow): SocialChallenge {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    subjectKind: row.subject_kind,
    metric: row.metric,
    metricTrackKey: row.metric_track_key,
    targetValue: Number(row.target_value),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    rewardXp: row.reward_xp,
    maxParticipants: row.max_participants,
    participantCount: row.participant_count,
    viewerJoined: row.viewer_joined,
    viewerProgress:
      row.viewer_progress === null ? null : Number(row.viewer_progress),
    viewerCompletedAt: row.viewer_completed_at,
    viewerAwardedAt: row.viewer_awarded_at,
    audienceKind: row.audience_kind === "cohort" ? "group" : "global",
    groupId: row.cohort_id,
  };
}

export function toSeasonDto(row: SocialSeasonRow): LeaderboardSeason {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subjectKind: row.subject_kind,
    metric: row.metric,
    metricTrackKey: row.metric_track_key,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    rollover: row.rollover,
    scope: row.scope === "cohort" ? "group" : "global",
    groupId: row.cohort_id,
  };
}
