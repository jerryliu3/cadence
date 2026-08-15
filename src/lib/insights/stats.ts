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

const INSIGHTS_STATS_CACHE_KEY = "insights-stats:v1";
const INSIGHTS_STATS_TIMEOUT_MS = 15_000;

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
  const cached = readTabDataCache<InsightsStatsResponse>(INSIGHTS_STATS_CACHE_KEY);
  if (!forceRefresh && cached) {
    return cached;
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

  writeTabDataCache(INSIGHTS_STATS_CACHE_KEY, payload, TAB_DATA_CACHE_TTL_MS);
  return payload;
}
