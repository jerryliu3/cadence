import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const HARD_DAILY_PROVIDER_LIMIT = 100;
const DEV_UNLIMITED_COACH_LIMIT = 1_000_000;

const quotaResultSchema = z.object({
  quota_usage_date: z.iso.date(),
  allowed: z.boolean(),
  request_count: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  retry_after_seconds: z.number().int().nonnegative(),
});

export type PlannerAiQuotaFeature = "planner_coach" | "bulk_parser";

export interface PlannerAiQuotaResult {
  usageDate: string;
  allowed: boolean;
  requestCount: number;
  remaining: number;
  retryAfterSeconds: number;
}

function clampQuotaLimit(limit: number | undefined, defaultLimit: number) {
  if (limit === undefined) {
    return defaultLimit;
  }
  if (limit > HARD_DAILY_PROVIDER_LIMIT) {
    console.warn(
      `[planner-ai-quota] configured limit ${limit} exceeds provider limit ${HARD_DAILY_PROVIDER_LIMIT}; clamping.`
    );
    return HARD_DAILY_PROVIDER_LIMIT;
  }
  return limit;
}

export function readBulkParserQuotaLimit() {
  return clampQuotaLimit(
    getServerEnv().CALENDAR_BULK_PARSER_DAILY_LIMIT,
    20
  );
}

export function shouldBypassPlannerCoachQuota() {
  const env = getServerEnv();
  return env.NODE_ENV !== "production" && env.CALENDAR_COACH_DISABLE_QUOTA;
}

export function readPlannerCoachQuotaLimit() {
  if (shouldBypassPlannerCoachQuota()) {
    return DEV_UNLIMITED_COACH_LIMIT;
  }
  return clampQuotaLimit(getServerEnv().CALENDAR_COACH_DAILY_LIMIT, 20);
}

export async function consumePlannerAiQuota({
  admin,
  ownerId,
  feature,
  limit,
  estimatedInputTokens,
}: {
  admin: AdminClient;
  ownerId: string;
  feature: PlannerAiQuotaFeature;
  limit: number;
  estimatedInputTokens: number;
}): Promise<PlannerAiQuotaResult> {
  const quotaResponse = await callAdminRpc(
    admin,
    "consume_planner_ai_quota",
    {
      p_owner: ownerId,
      p_feature: feature,
      p_limit: limit,
      p_input_tokens: estimatedInputTokens,
    }
  );
  if (quotaResponse.error) {
    throw new Error("quota_check_failed");
  }

  const quotaRowRaw = Array.isArray(quotaResponse.data)
    ? quotaResponse.data[0]
    : quotaResponse.data;
  const quotaRow = quotaResultSchema.safeParse(quotaRowRaw);
  if (!quotaRow.success) {
    throw new Error("quota_invariant_failed");
  }

  return {
    usageDate: quotaRow.data.quota_usage_date,
    allowed: quotaRow.data.allowed,
    requestCount: quotaRow.data.request_count,
    remaining: quotaRow.data.remaining,
    retryAfterSeconds: quotaRow.data.retry_after_seconds,
  };
}

