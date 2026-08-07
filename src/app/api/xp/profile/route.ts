import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorResponse(
  status: number,
  code: string,
  message: string,
  correlationId: string
) {
  return NextResponse.json(
    { code, message, correlationId },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET() {
  const correlationId = randomUUID();
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse(
      401,
      "authentication_required",
      "Sign in to view XP progress.",
      correlationId
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("xp_profiles")
    .select("total_xp, current_level")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return errorResponse(
      500,
      "xp_profile_unavailable",
      "XP progress is temporarily unavailable.",
      correlationId
    );
  }

  const totalXp = profile?.total_xp ?? 0;
  const currentLevel = profile?.current_level ?? 1;

  const [
    { data: nextLevel, error: nextLevelError },
    { data: nextReward, error: nextRewardError },
  ] = await Promise.all([
    supabase
      .from("xp_levels")
      .select("level, min_total_xp")
      .gt("min_total_xp", totalXp)
      .order("min_total_xp", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("xp_rewards")
      .select("level, reward_title, reward_description")
      .gt("level", currentLevel)
      .order("level", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (nextLevelError || nextRewardError) {
    return errorResponse(
      500,
      "xp_profile_unavailable",
      "XP progress is temporarily unavailable.",
      correlationId
    );
  }

  const xpToNextLevel =
    nextLevel === null
      ? null
      : Math.max((nextLevel.min_total_xp ?? totalXp) - totalXp, 0);

  return NextResponse.json(
    {
      schemaVersion: "1",
      profile: {
        totalXp,
        currentLevel,
        nextLevel: nextLevel?.level ?? null,
        xpToNextLevel,
      },
      nextReward:
        nextReward === null
          ? null
          : {
              level: nextReward.level,
              title: nextReward.reward_title,
              description: nextReward.reward_description,
            },
      correlationId,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
