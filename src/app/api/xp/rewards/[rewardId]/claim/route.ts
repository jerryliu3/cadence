import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  rewardId: z.uuid(),
});

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ rewardId: string }> | { rewardId: string } }
) {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("xpEnabled")) {
      throw new ApiRouteError(503, "xp_disabled", "XP is not enabled.");
    }

    const params = paramsSchema.parse(await context.params);
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to claim rewards.",
    });

    const admin = createAdminClient();
    const rewardResponse = await admin
      .from("user_rewards")
      .select("id,user_id,unlocked_at,claimed_at")
      .eq("id", params.rewardId)
      .eq("user_id", userId)
      .maybeSingle();

    if (rewardResponse.error) {
      throw new ApiRouteError(500, "reward_claim_failed", "Reward could not be claimed.");
    }
    if (!rewardResponse.data) {
      throw new ApiRouteError(404, "reward_not_found", "Reward was not found.");
    }
    if (!rewardResponse.data.unlocked_at) {
      throw new ApiRouteError(
        409,
        "reward_locked",
        "Reward is not unlocked yet."
      );
    }
    if (rewardResponse.data.claimed_at) {
      return apiSuccessResponse(
        {
          rewardId: rewardResponse.data.id,
          claimedAt: rewardResponse.data.claimed_at,
          alreadyClaimed: true,
        },
        correlationId
      );
    }

    const claimedAt = new Date().toISOString();
    const updateResponse = await admin
      .from("user_rewards")
      .update({ claimed_at: claimedAt })
      .eq("id", params.rewardId)
      .eq("user_id", userId)
      .select("id,claimed_at")
      .single();

    if (updateResponse.error || !updateResponse.data) {
      throw new ApiRouteError(500, "reward_claim_failed", "Reward could not be claimed.");
    }

    return apiSuccessResponse(
      {
        rewardId: updateResponse.data.id,
        claimedAt: updateResponse.data.claimed_at,
        alreadyClaimed: false,
      },
      correlationId
    );
  });
}
