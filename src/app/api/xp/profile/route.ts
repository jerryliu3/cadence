import { NextResponse } from "next/server";
import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  requireAuthenticatedRequestContext,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

interface XpTrackSummary {
  trackKey: string;
  label: string;
  totalXp: number;
  currentLevel: number;
}

function xpDisabledResponse(correlationId: string) {
  return NextResponse.json(
    {
      code: "xp_disabled",
      message: "XP is not enabled.",
      correlationId,
    },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

function xpUnavailableResponse(correlationId: string) {
  return NextResponse.json(
    {
      code: "xp_profile_unavailable",
      message: "XP profile is unavailable.",
      correlationId,
    },
    { status: 500, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  if (!isFeatureEnabled("xpEnabled")) {
    return xpDisabledResponse(correlationId);
  }

  let userId: string;
  let supabase: Awaited<
    ReturnType<typeof requireAuthenticatedRequestContext>
  >["supabase"];
  try {
    ({ userId, supabase } = await requireAuthenticatedRequestContext(request, {
        unauthorizedMessage: "Sign in to view XP profile.",
      }));
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return xpUnavailableResponse(correlationId);
  }

  const [
    xpProfilesResponse,
    rewardsResponse,
    categoryResponse,
    pendingAwardsResponse,
  ] = await Promise.all([
    supabase
      .from("xp_profiles")
      .select("track_key, total_xp, current_level")
      .eq("user_id", userId),
    supabase
      .from("xp_rewards")
      .select("id, level, reward_code, reward_title, reward_description"),
    supabase
      .from("goal_categories")
      .select("key, label, sort_order"),
    supabase
      .from("user_awards")
      .select(
        "id, unlocked_at, acknowledged_at, revoked_at, xp_rewards!inner(level, reward_code, reward_title, reward_description)"
      )
      .eq("user_id", userId)
      .is("acknowledged_at", null)
      .is("revoked_at", null)
      .order("unlocked_at", { ascending: false }),
  ]);

  if (
    xpProfilesResponse.error ||
    rewardsResponse.error ||
    categoryResponse.error ||
    pendingAwardsResponse.error
  ) {
    return xpUnavailableResponse(correlationId);
  }

  const rewards = (rewardsResponse.data ?? []).slice().sort((left, right) => left.level - right.level);
  const categoryByKey = new Map(
    (categoryResponse.data ?? []).map((row) => [row.key, { label: row.label, sortOrder: row.sort_order }])
  );

  const xpRows = xpProfilesResponse.data ?? [];
  const globalProfile = xpRows.find((row) => row.track_key === "global") ?? {
    track_key: "global",
    total_xp: 0,
    current_level: 1,
  };

  const [currentLevelResponse, nextLevelResponse] = await Promise.all([
    supabase
      .from("xp_levels")
      .select("min_total_xp")
      .eq("level", globalProfile.current_level)
      .maybeSingle(),
    supabase
      .from("xp_levels")
      .select("level, min_total_xp")
      .gt("level", globalProfile.current_level)
      .order("level", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (currentLevelResponse.error || nextLevelResponse.error) {
    return xpUnavailableResponse(correlationId);
  }

  const currentLevelMinXp = currentLevelResponse.data?.min_total_xp ?? 0;
  const nextLevel = nextLevelResponse.data?.level ?? null;
  const nextLevelMinXp = nextLevelResponse.data?.min_total_xp ?? null;
  const xpToNextLevel =
    nextLevelMinXp === null ? null : Math.max(nextLevelMinXp - globalProfile.total_xp, 0);

  const tracks: XpTrackSummary[] = xpRows
    .filter((row) => row.track_key !== "global")
    .map((row) => ({
      trackKey: row.track_key,
      label: categoryByKey.get(row.track_key)?.label ?? row.track_key,
      totalXp: row.total_xp,
      currentLevel: row.current_level,
      sortOrder: categoryByKey.get(row.track_key)?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.trackKey.localeCompare(right.trackKey);
    })
    .map((track) => ({
      trackKey: track.trackKey,
      label: track.label,
      totalXp: track.totalXp,
      currentLevel: track.currentLevel,
    }));

  const nextReward = rewards.find((reward) => reward.level > globalProfile.current_level) ?? null;
  const pendingAwards = (pendingAwardsResponse.data ?? [])
    .map((award) => {
      const reward = Array.isArray(award.xp_rewards) ? award.xp_rewards[0] : award.xp_rewards;
      if (!reward) {
        return null;
      }
      return {
        awardId: award.id,
        level: reward.level,
        trackKey: "global",
        title: reward.reward_title,
        description: reward.reward_description,
      };
    })
    .filter((award): award is NonNullable<typeof award> => award !== null);

  return NextResponse.json(
    {
      schemaVersion: "1",
      correlationId,
      profile: {
        totalXp: globalProfile.total_xp,
        currentLevel: globalProfile.current_level,
        currentLevelMinXp,
        nextLevel,
        nextLevelMinXp,
        xpToNextLevel,
      },
      tracks,
      nextReward: nextReward
        ? {
            level: nextReward.level,
            code: nextReward.reward_code,
            title: nextReward.reward_title,
            description: nextReward.reward_description,
          }
        : null,
      pendingAwards,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
