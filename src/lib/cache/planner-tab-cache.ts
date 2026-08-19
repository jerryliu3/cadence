import { invalidateTabDataCacheByPrefix } from "@/lib/cache/tab-data-cache";
import { invalidateProgressContextCache } from "@/lib/goals/progress-context";
import { INSIGHTS_STATS_CACHE_PREFIX } from "@/lib/insights/stats";

export const PLANNER_CONTEXT_CACHE_PREFIX = "planner-context:";
export const CHECKLIST_DATA_CACHE_PREFIX = "checklist-data:";
export const INSIGHTS_DATA_CACHE_PREFIX = "insights-data:";

export function invalidatePlannerRelatedTabCaches() {
  invalidateTabDataCacheByPrefix(PLANNER_CONTEXT_CACHE_PREFIX);
  invalidateTabDataCacheByPrefix(CHECKLIST_DATA_CACHE_PREFIX);
  invalidateTabDataCacheByPrefix(INSIGHTS_DATA_CACHE_PREFIX);
  invalidateTabDataCacheByPrefix(INSIGHTS_STATS_CACHE_PREFIX);
  invalidateProgressContextCache();
}
