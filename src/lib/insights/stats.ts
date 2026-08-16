import {
  getApiErrorMessage,
  getJson,
  isApiClientError,
  isApiClientTransportError,
} from "@/lib/api/client";
import {
  readTabDataCache,
  TAB_DATA_CACHE_TTL_MS,
  writeTabDataCache,
} from "@/lib/cache/tab-data-cache";
import type { InsightsStatsResponse } from "@/lib/insights/types";
import { createClient } from "@/lib/supabase/client";

const INSIGHTS_STATS_CACHE_KEY = "insights-stats:v1";
const INSIGHTS_STATS_TIMEOUT_MS = 15_000;

async function resolveInsightsStatsCacheKey() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return null;
    }
    return `${INSIGHTS_STATS_CACHE_KEY}:${user.id}`;
  } catch {
    return null;
  }
}

export class InsightsStatsAuthenticationError extends Error {
  readonly code = "authentication_required";
  readonly correlationId?: string;

  constructor(message: string, correlationId?: string) {
    super(message);
    this.name = "InsightsStatsAuthenticationError";
    this.correlationId = correlationId;
  }
}

export async function fetchInsightsStats({
  forceRefresh = false,
}: {
  forceRefresh?: boolean;
} = {}) {
  const cacheKey = await resolveInsightsStatsCacheKey();
  if (cacheKey) {
    const cached = readTabDataCache<InsightsStatsResponse>(cacheKey);
    if (!forceRefresh && cached) {
      return cached;
    }
  }

  let payload: InsightsStatsResponse;
  try {
    payload = await getJson<InsightsStatsResponse>("/api/insights/stats", {
      timeoutMs: INSIGHTS_STATS_TIMEOUT_MS,
    });
  } catch (error) {
    if (isApiClientTransportError(error) && error.reason === "timeout") {
      throw new Error("Insights stats request timed out. Please try again.");
    }
    if (isApiClientError(error) && error.code === "authentication_required") {
      throw new InsightsStatsAuthenticationError(error.message, error.correlationId);
    }
    throw new Error(getApiErrorMessage(error, "Insights stats could not be loaded."));
  }

  if (cacheKey) {
    writeTabDataCache(cacheKey, payload, TAB_DATA_CACHE_TTL_MS);
  }
  return payload;
}
