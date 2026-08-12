import { invalidateTabDataCacheByPrefix } from "@/lib/cache/tab-data-cache";
import { invalidateProgressContextCache } from "@/lib/goals/progress-context";

export const PLANNER_CONTEXT_CACHE_PREFIX = "planner-context:";
export const PLANNER_VISIBLE_MONTH_CONTEXT_CACHE_PREFIX = "planner-visible-month-context:";

export function invalidatePlannerRelatedTabCaches() {
  invalidateTabDataCacheByPrefix(PLANNER_CONTEXT_CACHE_PREFIX);
  invalidateTabDataCacheByPrefix(PLANNER_VISIBLE_MONTH_CONTEXT_CACHE_PREFIX);
  invalidateProgressContextCache();
}
