import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const createRewardSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).optional(),
  unlockTotalXp: z.number().int().positive().max(100_000_000),
});

function normalizeRewardRow(row: {
  id: string;
  title: string;
  note: string | null;
  unlock_total_xp: number;
  unlocked_at: string | null;
  claimed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    unlockTotalXp: row.unlock_total_xp,
    unlockedAt: row.unlocked_at,
    claimedAt: row.claimed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const runtime = "nodejs";

export async function GET() {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("xpEnabled")) {
      throw new ApiRouteError(503, "xp_disabled", "XP is not enabled.");
    }

    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to view your rewards.",
    });

    const response = await supabase
      .from("user_rewards")
      .select(
        "id,title,note,unlock_total_xp,unlocked_at,claimed_at,archived_at,created_at,updated_at"
      )
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (response.error) {
      throw new ApiRouteError(
        500,
        "reward_load_failed",
        "Rewards could not be loaded."
      );
    }

    return apiSuccessResponse(
      {
        rewards: (response.data ?? []).map(normalizeRewardRow),
      },
      correlationId
    );
  });
}

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("xpEnabled")) {
      throw new ApiRouteError(503, "xp_disabled", "XP is not enabled.");
    }

    const payload = await parseJsonBody({
      request,
      schema: createRewardSchema,
      maxBytes: 8 * 1024,
    });

    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to create rewards.",
    });

    const response = await supabase
      .from("user_rewards")
      .insert({
        user_id: userId,
        title: payload.title,
        note: payload.note ?? null,
        unlock_total_xp: payload.unlockTotalXp,
      })
      .select(
        "id,title,note,unlock_total_xp,unlocked_at,claimed_at,archived_at,created_at,updated_at"
      )
      .single();

    if (response.error || !response.data) {
      throw new ApiRouteError(
        500,
        "reward_create_failed",
        "Reward could not be created."
      );
    }

    const admin = createAdminClient();
    const xpResponse = await admin
      .from("xp_profiles")
      .select("total_xp")
      .eq("user_id", userId)
      .eq("track_key", "global")
      .maybeSingle();
    if (xpResponse.error) {
      throw new ApiRouteError(
        500,
        "reward_create_failed",
        "Reward could not be created."
      );
    }

    let created = response.data;
    const totalXp = xpResponse.data?.total_xp ?? 0;
    if (totalXp >= payload.unlockTotalXp && created.unlocked_at === null) {
      const unlockResponse = await admin
        .from("user_rewards")
        .update({ unlocked_at: new Date().toISOString() })
        .eq("id", created.id)
        .eq("user_id", userId)
        .select(
          "id,title,note,unlock_total_xp,unlocked_at,claimed_at,archived_at,created_at,updated_at"
        )
        .single();
      if (unlockResponse.error || !unlockResponse.data) {
        throw new ApiRouteError(
          500,
          "reward_create_failed",
          "Reward could not be created."
        );
      }
      created = unlockResponse.data;
    }

    return apiSuccessResponse(
      {
        reward: normalizeRewardRow(created),
      },
      correlationId,
      201
    );
  });
}
