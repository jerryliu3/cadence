import { eachDayOfInterval, endOfYear, format, parseISO, startOfYear } from "date-fns";
import type {
  PublicProfileBundle,
  PublicProfileGlobalAchievement,
  PublicProfileOverallStats,
} from "@cadence/shared/social/public-profile";
import {
  buildCompletableGoalIds,
  filterCompletionsForGoalIds,
  selectCompletableGoals,
} from "@cadence/shared/goals/completable-goals";
import { ApiRouteError } from "@/lib/api/route";
import { getDateInTimezone, resolveUserTimezone } from "@/lib/dates/timezone";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import type { Completion, Goal } from "@/lib/goals/types";
import { getGoalProgressSnapshot, type GoalProgressSnapshot } from "@/lib/goals/progress";
import { compareDateStrings, type WeeklyAnchorContext } from "@/lib/goals/periods";
import { buildInsightsStatsGroup } from "@/lib/insights/metrics";
import type { Database } from "@/lib/supabase/database.types";
import { progressionForTotalXp } from "@/lib/xp/progression";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_COMPLETION_FACTS } from "@/lib/planner/contracts/bounds";

const PAGE_SIZE = 1_000;
const MAX_PROFILE_GOALS = 1_000;

type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "id"
  | "username"
  | "display_name"
  | "avatar_url"
  | "social_activity_visible"
  | "week_starts_on"
  | "created_at"
  | "timezone"
>;

type XpProfileRow = Pick<
  Database["public"]["Tables"]["xp_profiles"]["Row"],
  "total_xp"
>;

type UserAwardRewardRow = {
  level: number | null;
  reward_code: string | null;
  reward_title: string | null;
  reward_description: string | null;
};

type UserAwardRow = {
  id: string;
  unlocked_at: string;
  revoked_at: string | null;
  xp_rewards: UserAwardRewardRow | UserAwardRewardRow[] | null;
};

export interface BuildPublicProfileBundleInput {
  viewerUserId: string;
  subjectProfile: ProfileRow;
  globalXpProfile: XpProfileRow | null;
  globalAchievements: UserAwardRow[];
  goals: Goal[];
  completions: Completion[];
  selectedYear: number;
}

function toDateOnly(value: string | null | undefined) {
  const candidate = (value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function getEarliestDate(candidates: Array<string | null>) {
  let earliest: string | null = null;
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (!earliest || compareDateStrings(candidate, earliest) < 0) {
      earliest = candidate;
    }
  }
  return earliest;
}

function groupCompletionsByGoal(completions: Completion[]) {
  const grouped = new Map<string, Completion[]>();
  for (const completion of completions) {
    const existing = grouped.get(completion.goal_id) ?? [];
    existing.push(completion);
    grouped.set(completion.goal_id, existing);
  }
  return grouped;
}

function mapGlobalAchievements(rows: UserAwardRow[]): PublicProfileGlobalAchievement[] {
  return rows.map((row) => {
    const reward = Array.isArray(row.xp_rewards) ? row.xp_rewards[0] : row.xp_rewards;
    return {
      id: row.id,
      unlockedAt: row.unlocked_at,
      revokedAt: row.revoked_at,
      level: reward?.level ?? null,
      code: reward?.reward_code ?? null,
      title: reward?.reward_title ?? null,
      description: reward?.reward_description ?? null,
    };
  });
}

function mapOverallStats(stats: ReturnType<typeof buildInsightsStatsGroup>): PublicProfileOverallStats {
  return {
    totalActivities: stats.totalActivities,
    totalGoalsCompleted: stats.totalGoalsCompleted,
    todayActivities: stats.todayActivities,
    activeStreakDays: stats.activeStreakDays,
    currentWeekActivities: stats.currentWeekActivities,
    currentMonthActivities: stats.currentMonthActivities,
  };
}

function buildYearHeatmap({
  completions,
  year,
}: {
  completions: Completion[];
  year: number;
}) {
  const yearStart = parseISO(`${year}-01-01`);
  const yearEnd = parseISO(`${year}-12-31`);
  const countsByDate = new Map<string, number>();

  for (const completion of completions) {
    const date = completion.completed_on;
    if (date < `${year}-01-01` || date > `${year}-12-31`) {
      continue;
    }
    countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1);
  }

  return eachDayOfInterval({ start: startOfYear(yearStart), end: endOfYear(yearEnd) }).map(
    (date) => {
      const key = format(date, "yyyy-MM-dd");
      return {
        date: key,
        count: countsByDate.get(key) ?? 0,
      };
    }
  );
}

export function buildPublicProfileBundle({
  viewerUserId,
  subjectProfile,
  globalXpProfile,
  globalAchievements,
  goals,
  completions,
  selectedYear,
}: BuildPublicProfileBundleInput): PublicProfileBundle {
  const isViewerSubject = viewerUserId === subjectProfile.id;
  const isPrivate = !isViewerSubject && subjectProfile.social_activity_visible === false;
  const profile = {
    subjectUserId: subjectProfile.id,
    username: subjectProfile.username,
    displayName: subjectProfile.display_name,
    avatarUrl: subjectProfile.avatar_url,
    isPrivate,
  };

  if (isPrivate) {
    return {
      schemaVersion: "1",
      profile,
      xp: null,
      globalAchievements: [],
      overallStats: null,
      yearHeatmap: [],
    };
  }

  const totalXp = globalXpProfile?.total_xp ?? 0;
  const progression = progressionForTotalXp(totalXp);
  const xp = {
    totalXp,
    currentLevel: progression.currentLevel,
    currentLevelMinXp: progression.currentLevelMinXp,
    nextLevel: progression.nextLevel,
    nextLevelMinXp: progression.nextLevelMinXp,
    xpToNextLevel: progression.xpToNextLevel,
  };

  const timezone = resolveUserTimezone(subjectProfile.timezone);
  const asOfDate = getDateInTimezone(new Date(), timezone);
  const weekStartsOn = normalizeWeekStartsOn(subjectProfile.week_starts_on);
  const weeklyAnchor: WeeklyAnchorContext = { weekStartsOn };
  const completableGoalIds = buildCompletableGoalIds({
    goals,
    userId: subjectProfile.id,
    memberTeamIds: [],
  });
  const completableGoals = selectCompletableGoals(goals, completableGoalIds);
  const completableCompletions = filterCompletionsForGoalIds(completions, completableGoalIds);
  const completionsByGoal = groupCompletionsByGoal(completableCompletions);

  const summariesByGoal = new Map<string, GoalProgressSnapshot>();
  for (const goal of completableGoals) {
    summariesByGoal.set(
      goal.id,
      getGoalProgressSnapshot(goal, completionsByGoal.get(goal.id) ?? [], asOfDate, {
        weeklyAnchor,
      })
    );
  }

  const profileCreatedDate = toDateOnly(subjectProfile.created_at);
  const earliestGoalStart = getEarliestDate(completableGoals.map((goal) => goal.start_date));
  const earliestCompletionDate = getEarliestDate(
    completableCompletions.map((completion) => completion.completed_on)
  );
  const fallbackCreatedDate =
    getEarliestDate([asOfDate, earliestGoalStart, earliestCompletionDate]) ?? asOfDate;
  const resolvedCreatedDate =
    profileCreatedDate && compareDateStrings(profileCreatedDate, asOfDate) <= 0
      ? profileCreatedDate
      : fallbackCreatedDate;

  const statsGroup = buildInsightsStatsGroup({
    goals: completableGoals,
    completions: completableCompletions,
    summariesByGoal,
    asOfDate,
    weekStartsOn,
    accountCreatedDate: resolvedCreatedDate,
  });

  return {
    schemaVersion: "1",
    profile,
    xp,
    globalAchievements: mapGlobalAchievements(globalAchievements),
    overallStats: mapOverallStats(statsGroup),
    yearHeatmap: buildYearHeatmap({
      completions: completableCompletions,
      year: selectedYear,
    }),
  };
}

async function loadGoalsForSubject({
  admin,
  subjectUserId,
}: {
  admin: SupabaseClient<Database>;
  subjectUserId: string;
}): Promise<Goal[]> {
  const goals: Goal[] = [];
  let lastGoalId: string | null = null;

  for (;;) {
    let query = admin
      .from("goals")
      .select("*")
      .eq("owner_id", subjectUserId)
      .eq("is_deleted", false)
      .is("team_id", null)
      .order("id")
      .limit(PAGE_SIZE);
    if (lastGoalId) {
      query = query.gt("id", lastGoalId);
    }
    const response = await query;
    if (response.error) {
      throw new ApiRouteError(
        500,
        "public_profile_load_failed",
        "Public profile data could not be loaded."
      );
    }
    const page = (response.data ?? []) as Goal[];
    goals.push(...page);
    if (goals.length > MAX_PROFILE_GOALS) {
      throw new ApiRouteError(
        413,
        "goal_bound_exceeded",
        "Too many goals are available for one public profile."
      );
    }
    if (page.length < PAGE_SIZE) {
      break;
    }
    lastGoalId = page.at(-1)?.id ?? null;
  }

  return goals;
}

async function loadCompletionsForSubject({
  admin,
  subjectUserId,
}: {
  admin: SupabaseClient<Database>;
  subjectUserId: string;
}): Promise<Completion[]> {
  const completions: Completion[] = [];
  let lastCompletionId: string | null = null;

  for (;;) {
    let query = admin
      .from("completions")
      .select("*")
      .eq("user_id", subjectUserId)
      .order("id")
      .limit(PAGE_SIZE);
    if (lastCompletionId) {
      query = query.gt("id", lastCompletionId);
    }
    const response = await query;
    if (response.error) {
      throw new ApiRouteError(
        500,
        "public_profile_load_failed",
        "Public profile data could not be loaded."
      );
    }

    const page = (response.data ?? []) as Completion[];
    completions.push(...page);
    if (completions.length > MAX_COMPLETION_FACTS) {
      throw new ApiRouteError(
        413,
        "completion_bound_exceeded",
        "Completion history exceeds the supported public profile bound."
      );
    }
    if (page.length < PAGE_SIZE) {
      break;
    }
    lastCompletionId = page.at(-1)?.id ?? null;
  }

  return completions;
}

export async function loadPublicProfileBundle({
  admin,
  viewerUserId,
  subjectUserId,
  selectedYear,
}: {
  admin: SupabaseClient<Database>;
  viewerUserId: string;
  subjectUserId: string;
  selectedYear: number;
}) {
  const profileResponse = await admin
    .from("profiles")
    .select("id,username,display_name,avatar_url,social_activity_visible,week_starts_on,created_at,timezone")
    .eq("id", subjectUserId)
    .maybeSingle();

  if (profileResponse.error) {
    throw new ApiRouteError(
      500,
      "public_profile_load_failed",
      "Public profile data could not be loaded."
    );
  }
  if (!profileResponse.data) {
    throw new ApiRouteError(404, "profile_not_found", "Profile was not found.");
  }

  const [xpResponse, globalAchievementsResponse, goals, completions] = await Promise.all([
    admin
      .from("xp_profiles")
      .select("total_xp")
      .eq("user_id", subjectUserId)
      .eq("track_key", "global")
      .maybeSingle(),
    admin
      .from("user_awards")
      .select(
        "id,unlocked_at,revoked_at,xp_rewards!inner(level,reward_code,reward_title,reward_description)"
      )
      .eq("user_id", subjectUserId)
      .order("unlocked_at", { ascending: false }),
    loadGoalsForSubject({ admin, subjectUserId }),
    loadCompletionsForSubject({ admin, subjectUserId }),
  ]);

  if (xpResponse.error || globalAchievementsResponse.error) {
    throw new ApiRouteError(
      500,
      "public_profile_load_failed",
      "Public profile data could not be loaded."
    );
  }

  return buildPublicProfileBundle({
    viewerUserId,
    subjectProfile: profileResponse.data,
    globalXpProfile: xpResponse.data,
    globalAchievements: (globalAchievementsResponse.data ?? []) as UserAwardRow[],
    goals,
    completions,
    selectedYear,
  });
}
