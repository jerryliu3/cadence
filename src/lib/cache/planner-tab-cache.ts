import { invalidateTabDataCacheByPrefix } from "@/lib/cache/tab-data-cache";
import { invalidateProgressContextCache } from "@/lib/goals/progress-context";

export const PLANNER_CONTEXT_CACHE_PREFIX = "planner-context:";

export function invalidatePlannerRelatedTabCaches() {
  invalidateTabDataCacheByPrefix(PLANNER_CONTEXT_CACHE_PREFIX);
  invalidateProgressContextCache();
}
