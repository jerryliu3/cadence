import { NextResponse } from "next/server";
import {
  ApiRouteError,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import { toLocalDateString } from "@/lib/dates/day";
import {
  buildCompletableGoalIds,
  filterCompletionsForGoalIds,
  selectCompletableGoals,
} from "@cadence/shared/goals/completable-goals";
import {
  getGoalProgressSnapshot,
  type GoalProgressSnapshot,
} from "@/lib/goals/progress";
import { compareDateStrings, type WeeklyAnchorContext } from "@/lib/goals/periods";
import type { Completion, Goal } from "@/lib/goals/types";
import { buildInsightsStatsGroup } from "@/lib/insights/metrics";
import type { InsightsStatsResponse } from "@/lib/insights/types";
import { MAX_COMPLETION_FACTS } from "@/lib/planner/contracts/bounds";

export const runtime = "nodejs";

const PAGE_SIZE = 1_000;

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

export async function GET(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { supabase, userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to view insights stats.",
    });

    const [profileResponse, teamMembersResponse] = await Promise.all([
      supabase
        .from("profiles")
        .select("week_starts_on, created_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("team_members").select("team_id").eq("user_id", userId),
    ]);

    if (profileResponse.error || !profileResponse.data) {
      throw new ApiRouteError(
        500,
        "insights_stats_load_failed",
        "Insights stats could not be loaded."
      );
    }
    if (teamMembersResponse.error) {
      throw new ApiRouteError(
        500,
        "insights_stats_load_failed",
        "Insights stats could not be loaded."
      );
    }

    const weekStartsOn = normalizeWeekStartsOn(profileResponse.data.week_starts_on);
    const profileCreatedDate = toDateOnly(profileResponse.data.created_at);
    const asOfDate = toLocalDateString();
    const weeklyAnchor: WeeklyAnchorContext = { weekStartsOn };
    const memberTeamIds = (teamMembersResponse.data ?? []).map((row) => row.team_id);

    const goals: Goal[] = [];
    let lastGoalId: string | null = null;
    for (;;) {
      let query = supabase
        .from("goals")
        .select("*")
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
          "insights_stats_load_failed",
          "Insights stats could not be loaded."
        );
      }
      const page = (response.data ?? []) as Goal[];
      goals.push(...page);
      if (page.length < PAGE_SIZE) {
        break;
      }
      lastGoalId = page.at(-1)?.id ?? null;
    }

    const completions: Completion[] = [];
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
          "insights_stats_load_failed",
          "Insights stats could not be loaded."
        );
      }
      const page = (response.data ?? []) as Completion[];
      completions.push(...page);
      if (completions.length > MAX_COMPLETION_FACTS) {
        throw new ApiRouteError(
          413,
          "completion_bound_exceeded",
          "Completion history exceeds the supported insights stats bound."
        );
      }
      if (page.length < PAGE_SIZE) {
        break;
      }
      lastCompletionId = page.at(-1)?.id ?? null;
    }

    const completableGoalIds = buildCompletableGoalIds({
      goals,
      userId,
      memberTeamIds,
    });
    const completableGoals = selectCompletableGoals(goals, completableGoalIds);
    const completableCompletions = filterCompletionsForGoalIds(completions, completableGoalIds);
    const completionsByGoal = groupCompletionsByGoal(completableCompletions);

    const summaryByGoal = new Map<string, GoalProgressSnapshot>();
    for (const goal of completableGoals) {
      summaryByGoal.set(
        goal.id,
        getGoalProgressSnapshot(
          goal,
          completionsByGoal.get(goal.id) ?? [],
          asOfDate,
          { weeklyAnchor }
        )
      );
    }

    const earliestGoalStart = getEarliestDate(
      completableGoals.map((goal) => goal.start_date)
    );
    const earliestCompletionDate = getEarliestDate(
      completableCompletions.map((completion) => completion.completed_on)
    );
    const fallbackCreatedDate =
      getEarliestDate([asOfDate, earliestGoalStart, earliestCompletionDate]) ?? asOfDate;
    const resolvedCreatedDate =
      profileCreatedDate && compareDateStrings(profileCreatedDate, asOfDate) <= 0
        ? profileCreatedDate
        : fallbackCreatedDate;

    const overall = buildInsightsStatsGroup({
      goals: completableGoals,
      completions: completableCompletions,
      summariesByGoal: summaryByGoal,
      asOfDate,
      weekStartsOn,
      accountCreatedDate: resolvedCreatedDate,
    });

    const memberTeamIdSet = new Set(memberTeamIds);
    const teamGoals = completableGoals.filter(
      (goal) => goal.team_id && memberTeamIdSet.has(goal.team_id)
    );
    const teamGoalIds = new Set(teamGoals.map((goal) => goal.id));
    const teamCompletions = filterCompletionsForGoalIds(completableCompletions, teamGoalIds);
    const teamSummaryByGoal = new Map<string, GoalProgressSnapshot>();
    for (const goal of teamGoals) {
      const summary = summaryByGoal.get(goal.id);
      if (summary) {
        teamSummaryByGoal.set(goal.id, summary);
      }
    }

    const team =
      teamGoals.length > 0
        ? buildInsightsStatsGroup({
            goals: teamGoals,
            completions: teamCompletions,
            summariesByGoal: teamSummaryByGoal,
            asOfDate,
            weekStartsOn,
            accountCreatedDate: resolvedCreatedDate,
          })
        : null;

    const payload: InsightsStatsResponse = {
      schemaVersion: "1",
      asOfDate,
      weekStartsOn,
      accountCreatedDate: resolvedCreatedDate,
      overall,
      team,
      correlationId,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
