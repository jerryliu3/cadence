import { buildPlannerVisibleWindow } from "@cadence/shared/planner/visible-window";

export interface MobilePlannerWorkUnit {
  originalGoalId: string;
  unitKey: string;
  scheduledDate: string | null;
  label: string | null;
  classification: string;
  creditState: string;
  placementWindow?: { start: string; end: string } | null;
  draftMoveWindow?: { start: string; end: string } | null;
  creditWindow?: { start: string; end: string };
}

export interface MobilePlannerContext {
  scopeMonth: string;
  asOfDate: string;
  timezone: string;
  goalTitles: Record<string, string>;
  capabilities?: {
    crossMonthMovesEnabled: boolean;
  };
  preview: {
    generationInputHash?: string;
    solver?: { publishable?: boolean; issueCodes?: string[] };
    workUnits: MobilePlannerWorkUnit[];
  } | null;
  activePlan: {
    plan: { id: string; version: number; status: string };
    items: Array<{
      id: string;
      unit_key: string;
      locked: boolean;
    }>;
  } | null;
  revisions: {
    scheduleDigest?: string | null;
  };
  preferences: {
    defaultPolicy: unknown;
  } | null;
  unplaceableGoals?: Array<{
    goalId: string;
    requirementFingerprint: string;
    policyRevision: number;
    effectiveSpanEnd: string;
    unplacedCount: number;
    reason: "capacity" | "invalid_lock";
    computedAt?: string;
  }>;
}

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
