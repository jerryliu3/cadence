import type {
  PlannerContextPayload,
  PlannerWorkUnit,
} from "@cadence/shared/planner/context";
import { buildPlannerVisibleWindow } from "@cadence/shared/planner/visible-window";

export type MobilePlannerContext = PlannerContextPayload;
export type MobilePlannerWorkUnit = PlannerWorkUnit;

interface MobilePlannerApiClient {
  postJson(
    path: string,
    body: Record<string, unknown>
  ): Promise<MobilePlannerContext>;
  getJson(
    path: string,
    options: { query: Record<string, string> }
  ): Promise<MobilePlannerContext>;
}

export function createMobilePlannerContextLoader(
  client: MobilePlannerApiClient
) {
  let prepared = false;

  const request = async (scopeMonth: string, forcePrepare: boolean) => {
    const visibleWindow = buildPlannerVisibleWindow(scopeMonth);
    if (forcePrepare || !prepared) {
      const context = await client.postJson("/api/planner/prepare", {
        scopeMonth,
        visibleStart: visibleWindow.start,
        visibleEnd: visibleWindow.end,
      });
      prepared = true;
      return context;
    }
    return client.getJson("/api/planner/context", {
      query: {
        scopeMonth,
        visibleStart: visibleWindow.start,
        visibleEnd: visibleWindow.end,
      },
    });
  };

  return {
    load: (scopeMonth: string) => request(scopeMonth, false),
    forcePrepare: (scopeMonth: string) => request(scopeMonth, true),
    reset: () => {
      prepared = false;
    },
  };
}
