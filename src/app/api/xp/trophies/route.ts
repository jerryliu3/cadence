import {
  ApiRouteError,
  apiSuccessResponse,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { getDateInTimezone, resolveUserTimezone } from "@/lib/dates/timezone";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  getGoalProgressSnapshot,
  type GoalProgressSnapshot,
} from "@/lib/goals/progress";
import type { Completion, Goal } from "@/lib/goals/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PAGE_SIZE = 1_000;
const MAX_GOALS = 1_000;
const MAX_COMPLETIONS = 5_000;
const MAX_LEDGER_ROWS = 5_000;

function groupCompletionsByGoal(completions: Completion[]) {
  const grouped = new Map<string, Completion[]>();
  for (const completion of completions) {
    const existing = grouped.get(completion.goal_id) ?? [];
    existing.push(completion);
    grouped.set(completion.goal_id, existing);
  }
  return grouped;
}

function summarizeAchievedGoal({
  goal,
  summary,
  completions,
}: {
  goal: Goal;
  summary: GoalProgressSnapshot;
  completions: Completion[];
}) {
  const achievedOn =
    completions.length === 0
      ? null
      : completions.reduce<string | null>(
          (latest, completion) =>
            latest === null || completion.completed_on > latest
              ? completion.completed_on
              : latest,
          null
        );

  return {
    goalId: goal.id,
    title: goal.title,
    category: goal.category,
    categoryKey: goal.category_key,
    rewardText: goal.reward_text,
    achievedOn,
    percent: summary.percent,
    currentStreak: summary.currentStreak,
    longestStreak: summary.longestStreak,
  };
}

export async function GET() {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("xpEnabled")) {
      throw new ApiRouteError(503, "xp_disabled", "XP is not enabled.");
    }

    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to view trophies.",
    });
    const admin = createAdminClient();

    const profileResponse = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    if (profileResponse.error) {
      throw new ApiRouteError(500, "trophies_load_failed", "Trophies could not be loaded.");
    }
    const timezone = resolveUserTimezone(profileResponse.data?.timezone);
    const asOfDate = getDateInTimezone(new Date(), timezone);

    const globalXpResponse = await admin
      .from("xp_profiles")
      .select("total_xp")
      .eq("user_id", userId)
      .eq("track_key", "global")
      .maybeSingle();
    if (globalXpResponse.error) {
      throw new ApiRouteError(500, "trophies_load_failed", "Trophies could not be loaded.");
    }
    const totalXp = globalXpResponse.data?.total_xp ?? 0;

    const unlockTimestamp = new Date().toISOString();
    const unlockResponse = await admin
      .from("user_rewards")
      .update({ unlocked_at: unlockTimestamp })
      .eq("user_id", userId)
      .is("archived_at", null)
      .is("unlocked_at", null)
      .lte("unlock_total_xp", totalXp);
    if (unlockResponse.error) {
      throw new ApiRouteError(500, "trophies_load_failed", "Trophies could not be loaded.");
    }

    const relockResponse = await admin
      .from("user_rewards")
      .update({ unlocked_at: null })
      .eq("user_id", userId)
      .is("archived_at", null)
      .is("claimed_at", null)
      .not("unlocked_at", "is", null)
      .gt("unlock_total_xp", totalXp);
    if (relockResponse.error) {
      throw new ApiRouteError(500, "trophies_load_failed", "Trophies could not be loaded.");
    }

    const goals: Goal[] = [];
    let goalsTruncated = false;
    let lastGoalId: string | null = null;
    for (;;) {
      let query = supabase
        .from("goals")
        .select("*")
        .eq("owner_id", userId)
        .eq("is_deleted", false)
        .order("id")
        .limit(PAGE_SIZE);
      if (lastGoalId) {
        query = query.gt("id", lastGoalId);
      }
      const response = await query;
      if (response.error) {
        throw new ApiRouteError(
          500,
          "trophies_load_failed",
          "Trophies could not be loaded."
        );
      }
      const page = (response.data ?? []) as Goal[];
      for (const goal of page) {
        if (goals.length >= MAX_GOALS) {
          goalsTruncated = true;
          break;
        }
        goals.push(goal);
      }
      if (goalsTruncated || page.length < PAGE_SIZE) {
        break;
      }
      lastGoalId = page.at(-1)?.id ?? null;
    }

    const completions: Completion[] = [];
    let completionsTruncated = false;
    let lastCompletionId: string | null = null;
    for (;;) {
      let query = supabase
        .from("completions")
        .select("*")
        .eq("user_id", userId)
        .order("id")
        .limit(PAGE_SIZE);
      if (lastCompletionId) {
        query = query.gt("id", lastCompletionId);
      }
      const response = await query;
      if (response.error) {
        throw new ApiRouteError(
          500,
          "trophies_load_failed",
          "Trophies could not be loaded."
        );
      }
      const page = (response.data ?? []) as Completion[];
      for (const completion of page) {
        if (completions.length >= MAX_COMPLETIONS) {
          completionsTruncated = true;
          break;
        }
        completions.push(completion);
      }
      if (completionsTruncated || page.length < PAGE_SIZE) {
        break;
      }
      lastCompletionId = page.at(-1)?.id ?? null;
    }

    const completionsByGoal = groupCompletionsByGoal(completions);
    const achievedGoals = goals
      .map((goal) => ({
        goal,
        completions: completionsByGoal.get(goal.id) ?? [],
        summary: getGoalProgressSnapshot(
          goal,
          completionsByGoal.get(goal.id) ?? [],
          asOfDate
        ),
      }))
      .filter((entry) => entry.summary.outcome === "achieved")
      .map((entry) => summarizeAchievedGoal(entry));

    const [systemAwardsResponse, personalRewardsResponse, ledgerResponse] =
      await Promise.all([
        supabase
          .from("user_awards")
          .select(
            "id,unlocked_at,acknowledged_at,revoked_at,xp_rewards!inner(level,reward_code,reward_title,reward_description)"
          )
          .eq("user_id", userId)
          .order("unlocked_at", { ascending: false }),
        supabase
          .from("user_rewards")
          .select(
            "id,title,note,unlock_total_xp,unlocked_at,claimed_at,archived_at,created_at,updated_at"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("xp_ledger")
          .select("seq,earned_on,xp_delta,event_type,track_key")
          .eq("user_id", userId)
          .order("seq", { ascending: false })
          .limit(MAX_LEDGER_ROWS + 1),
      ]);

    if (systemAwardsResponse.error || personalRewardsResponse.error || ledgerResponse.error) {
      throw new ApiRouteError(500, "trophies_load_failed", "Trophies could not be loaded.");
    }

    const levelHistoryRows = ledgerResponse.data ?? [];
    const levelHistoryTruncated = levelHistoryRows.length > MAX_LEDGER_ROWS;
    const levelHistory = levelHistoryRows.slice(0, MAX_LEDGER_ROWS).map((row) => ({
      seq: row.seq,
      earnedOn: row.earned_on,
      xpDelta: row.xp_delta,
      eventType: row.event_type,
      trackKey: row.track_key,
    }));

    return apiSuccessResponse(
      {
        asOfDate,
        timezone,
        achievedGoals,
        systemAwards: (systemAwardsResponse.data ?? []).map((award) => {
          const reward = Array.isArray(award.xp_rewards)
            ? award.xp_rewards[0]
            : award.xp_rewards;
          return {
            id: award.id,
            unlockedAt: award.unlocked_at,
            acknowledgedAt: award.acknowledged_at,
            revokedAt: award.revoked_at,
            level: reward?.level ?? null,
            code: reward?.reward_code ?? null,
            title: reward?.reward_title ?? null,
            description: reward?.reward_description ?? null,
          };
        }),
        personalRewards: (personalRewardsResponse.data ?? []).map((reward) => ({
          id: reward.id,
          title: reward.title,
          note: reward.note,
          unlockTotalXp: reward.unlock_total_xp,
          unlockedAt: reward.unlocked_at,
          claimedAt: reward.claimed_at,
          archivedAt: reward.archived_at,
          createdAt: reward.created_at,
          updatedAt: reward.updated_at,
        })),
        levelHistory,
        truncated: {
          goals: goalsTruncated,
          completions: completionsTruncated,
          levelHistory: levelHistoryTruncated,
        },
      },
      correlationId
    );
  });
}
