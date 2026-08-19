import { afterEach, describe, expect, it } from "vitest";
import {
  readTabDataCache,
  resetTabDataCacheForTests,
  writeTabDataCache,
} from "@/lib/cache/tab-data-cache";
import {
  PLANNER_CONTEXT_CACHE_PREFIX,
  invalidatePlannerRelatedTabCaches,
} from "@/lib/cache/planner-tab-cache";
import { INSIGHTS_STATS_CACHE_PREFIX } from "@/lib/insights/stats";

describe("invalidatePlannerRelatedTabCaches", () => {
  afterEach(() => {
    resetTabDataCacheForTests();
    window.sessionStorage.clear();
  });

  it("clears planner, insights stats, and progress cache keys", () => {
    writeTabDataCache(`${PLANNER_CONTEXT_CACHE_PREFIX}2026-08`, { context: true });
    writeTabDataCache(`${INSIGHTS_STATS_CACHE_PREFIX}:viewer`, { stats: true });
    writeTabDataCache("progress-context:test", { progress: true });

    invalidatePlannerRelatedTabCaches();

    expect(readTabDataCache(`${PLANNER_CONTEXT_CACHE_PREFIX}2026-08`)).toBeNull();
    expect(readTabDataCache(`${INSIGHTS_STATS_CACHE_PREFIX}:viewer`)).toBeNull();
    expect(readTabDataCache("progress-context:test")).toBeNull();
  });
});
