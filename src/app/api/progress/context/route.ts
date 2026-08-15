import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiRouteError,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import { isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  getAnchoredPeriod,
  type WeeklyAnchorContext,
} from "@/lib/goals/periods";
import {
  getGoalProgressSnapshot,
} from "@/lib/goals/progress";
import type { Completion, Goal } from "@/lib/goals/types";
import {
  MAX_API_BODY_BYTES,
  MAX_COMPLETION_FACTS,
} from "@/lib/planner/contracts/bounds";
import { isTargetedRecurringGoal } from "@/lib/planner/requirements";
import { requireTeamPartner, resolveActiveTeamPartner } from "@/lib/social/team";
import type { ProgressContextSummary } from "@cadence/shared/goals/progress-context";
import { selectViewerVisibleGoals } from "@cadence/shared/goals/visible-goals";

export const runtime = "nodejs";

const PAGE_SIZE = 1_000;
const MAX_PROGRESS_GOALS = 1_000;
const querySchema = z
  .object({
    asOfDate: z.iso.date(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isValidIanaTimezone),
    viewDate: z.iso.date().optional(),
    factsFrom: z.iso.date().optional(),
    factsTo: z.iso.date().optional(),
    subjectUserId: z.uuid().optional(),
  })
  .refine(
    ({ factsFrom, factsTo }) => Boolean(factsFrom) === Boolean(factsTo),
    "factsFrom and factsTo must be provided together."
  )
  .refine(
    ({ factsFrom, factsTo }) =>
      !factsFrom ||
      !factsTo ||
      (factsFrom <= factsTo &&
        new Date(`${factsTo}T00:00:00Z`).getTime() -
          new Date(`${factsFrom}T00:00:00Z`).getTime() <=
          366 * 86_400_000),
    "Date-fact windows must contain at most 367 inclusive dates."
  )
  .refine(
    ({ viewDate, factsFrom }) => !(viewDate && factsFrom),
    "Choose a Checklist view date or an Insights fact window."
  );

function groupCompletions(completions: Completion[]) {
  const grouped = new Map<string, Completion[]>();
  for (const completion of completions) {
    const existing = grouped.get(completion.goal_id) ?? [];
    existing.push(completion);
    grouped.set(completion.goal_id, existing);
  }
  return grouped;
}

function getChecklistFacts(
  goals: Goal[],
  completionsByGoal: Map<string, Completion[]>,
  viewDate: string,
  weeklyAnchor: WeeklyAnchorContext | null
) {
  return goals.flatMap((goal) => {
    const completions = completionsByGoal.get(goal.id) ?? [];
    if (
      goal.frequency_type !== "recurring" ||
      isTargetedRecurringGoal(goal)
    ) {
      return completions.filter(
        (completion) => completion.completed_on === viewDate
      );
    }

    const period = getAnchoredPeriod(
      goal.start_date,
      goal.recurrence_interval ?? "daily",
      viewDate,
      weeklyAnchor
    );
    return completions.filter(
      (completion) =>
        completion.completed_on >= period.start &&
        completion.completed_on <= period.end
    );
  });
}

async function resolveWeeklyAnchor({
  supabase,
  viewerUserId,
  subjectUserId,
}: {
  supabase: Awaited<
    ReturnType<typeof requireAuthenticatedRequestContext>
  >["supabase"];
  viewerUserId: string;
  subjectUserId: string;
}): Promise<WeeklyAnchorContext | null> {
  if (viewerUserId === subjectUserId) {
    const profileResponse = await supabase
      .from("profiles")
      .select("week_starts_on")
      .eq("id", viewerUserId)
      .maybeSingle();
    if (profileResponse.error) {
      throw new ApiRouteError(
        500,
        "progress_load_failed",
        "Goal progress could not be loaded."
      );
    }
    if (!profileResponse.data) {
      return null;
    }
    return {
      weekStartsOn: normalizeWeekStartsOn(profileResponse.data.week_starts_on),
    };
  }

  const { data, error } = await supabase.rpc("get_partner_profile_service", {
    p_owner_id: subjectUserId,
  });
  if (error) {
    throw new ApiRouteError(
      500,
      "progress_load_failed",
      "Goal progress could not be loaded."
    );
  }
  if (!data || typeof data !== "object") {
    throw new ApiRouteError(
      403,
      "not_team_partner",
      "Partner progress is available only for your active team partner."
    );
  }
  if (!("week_starts_on" in data)) {
    throw new ApiRouteError(
      500,
      "progress_load_failed",
      "Partner weekly anchor is unavailable."
    );
  }

  const weekStartsOnValue = (data as { week_starts_on?: unknown }).week_starts_on;
  return {
    weekStartsOn: normalizeWeekStartsOn(
      typeof weekStartsOnValue === "number" ? weekStartsOnValue : undefined
    ),
  };
}

export async function GET(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { supabase, userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to view goal progress.",
    });

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      asOfDate: url.searchParams.get("asOfDate") ?? undefined,
      timezone: url.searchParams.get("timezone") ?? undefined,
      viewDate: url.searchParams.get("viewDate") ?? undefined,
      factsFrom: url.searchParams.get("factsFrom") ?? undefined,
      factsTo: url.searchParams.get("factsTo") ?? undefined,
      subjectUserId: url.searchParams.get("subjectUserId") ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new ApiRouteError(
        400,
        "validation_failed",
        "Provide valid bounded progress dates."
      );
    }
    const subjectUserId = parsedQuery.data.subjectUserId ?? userId;
    const isViewerSubject = subjectUserId === userId;
    if (!isViewerSubject) {
      if (!isFeatureEnabled("socialEnabled")) {
        throw new ApiRouteError(
          403,
          "not_team_partner",
          "Partner progress is available only for your active team partner."
        );
      }
      await requireTeamPartner({ supabase, subjectUserId });
    }

    const weeklyAnchor = await resolveWeeklyAnchor({
      supabase,
      viewerUserId: userId,
      subjectUserId,
    });

    // A teamed viewer can read their partner's personal goals through
    // can_view_goal, but those belong in the partner lane, not the viewer's own
    // summaries. Exclude by owner rather than allow-listing what the viewer can
    // see: an allow-list silently drops anything the list forgets.
    const activePartner =
      isViewerSubject && isFeatureEnabled("socialEnabled")
        ? await resolveActiveTeamPartner({ supabase })
        : null;

    const goals: Goal[] = [];
    let lastGoalId: string | null = null;
    for (;;) {
      let query = supabase
        .from("goals")
        .select("*")
        .eq("is_deleted", false)
        .order("id")
        .limit(PAGE_SIZE);
      if (!isViewerSubject) {
        query = query.eq("owner_id", subjectUserId);
      }
      if (lastGoalId) {
        query = query.gt("id", lastGoalId);
      }
      const response = await query;
      if (response.error) {
        throw new ApiRouteError(
          500,
          "progress_load_failed",
          "Goal progress could not be loaded."
        );
      }
      const page = (response.data ?? []) as Goal[];
      const visiblePage = isViewerSubject
        ? selectViewerVisibleGoals({
            goals: page,
            partnerId: activePartner?.partnerId ?? null,
              memberTeamIds: activePartner?.teamId ? [activePartner.teamId] : [],
          })
        : page;
      goals.push(...visiblePage);
      if (goals.length > MAX_PROGRESS_GOALS) {
        throw new ApiRouteError(
          413,
          "goal_bound_exceeded",
          "Too many goals are available for one progress context."
        );
      }
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
          "progress_load_failed",
          "Goal progress could not be loaded."
        );
      }

      const page = (response.data ?? []) as Completion[];
      completions.push(...page);
      if (completions.length > MAX_COMPLETION_FACTS) {
        throw new ApiRouteError(
          413,
          "completion_bound_exceeded",
          "Completion history exceeds the supported progress bound."
        );
      }
      if (page.length < PAGE_SIZE) {
        break;
      }
      lastCompletionId = page.at(-1)?.id ?? null;
    }

    const completionsByGoal = groupCompletions(completions);
    const visibleGoalIds = new Set(goals.map((goal) => goal.id));
    const summaries = goals.map((goal) =>
      getGoalProgressSnapshot(
        goal,
        completionsByGoal.get(goal.id) ?? [],
        parsedQuery.data.asOfDate,
        { weeklyAnchor }
      )
    ) satisfies ProgressContextSummary[];

    let facts: Completion[] = [];
    if (parsedQuery.data.viewDate) {
      facts = getChecklistFacts(
        goals,
        completionsByGoal,
        parsedQuery.data.viewDate,
        weeklyAnchor
      ).filter((completion) => visibleGoalIds.has(completion.goal_id));
    } else if (parsedQuery.data.factsFrom && parsedQuery.data.factsTo) {
      facts = completions.filter(
        (completion) =>
          visibleGoalIds.has(completion.goal_id) &&
          completion.completed_on >= parsedQuery.data.factsFrom! &&
          completion.completed_on <= parsedQuery.data.factsTo!
      );
    }

    const responsePayload = {
      schemaVersion: "1",
      asOfDate: parsedQuery.data.asOfDate,
      timezone: parsedQuery.data.timezone,
      weekStartsOn: normalizeWeekStartsOn(weeklyAnchor?.weekStartsOn),
      summaries,
      facts: facts.map(({ goal_id, completed_on, source }) => ({
        goal_id,
        completed_on,
        source,
      })),
      truncated: false,
      correlationId,
    } as const;
    if (
      Buffer.byteLength(JSON.stringify(responsePayload), "utf8") >
      MAX_API_BODY_BYTES
    ) {
      throw new ApiRouteError(
        413,
        "response_bound_exceeded",
        "The requested progress context is too large."
      );
    }

    return NextResponse.json(responsePayload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
