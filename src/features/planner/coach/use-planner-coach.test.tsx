import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePlannerCoach } from "@/features/planner/coach/use-planner-coach";
import type { UsePlannerCoachArgs } from "@/features/planner/coach/coach-types";
import type { PlannerContextPayload } from "@/features/planner/calendar-surface.types";

function buildContext(
  overrides: Partial<PlannerContextPayload["capabilities"]> = {}
): PlannerContextPayload {
  return {
    schemaVersion: "1",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-06",
    timezone: "UTC",
    goalTitles: {},
    preferences: null,
    capabilities: {
      plannerRead: true,
      plannerGeneration: true,
      plannerPlanWrites: true,
      targetedExactCompletion: true,
      coachAi: true,
      overlap: false,
      ...overrides,
    },
    activePlan: null,
    preview: null,
    revisions: {
      canonicalRevision: 1,
      executionRevision: 1,
    },
    staleness: {
      stale: false,
      reasons: [],
    },
  };
}

function buildArgs(
  overrides: Partial<UsePlannerCoachArgs> = {}
): UsePlannerCoachArgs {
  return {
    activeTab: "today",
    context: null,
    entriesByDate: new Map(),
    effectivePreview: null,
    effectiveDraftPolicy: null,
    hasDraftSession: false,
    refreshDraftPreview: vi.fn().mockResolvedValue(null),
    applyDraftPolicy: vi.fn(),
    getNonPublishablePreviewMessage: vi.fn().mockReturnValue("blocked"),
    ...overrides,
  };
}

describe("usePlannerCoach", () => {
  it("reports coach unavailable without context", () => {
    const { result } = renderHook(() => usePlannerCoach(buildArgs()));
    expect(result.current.state.canUseCoach).toBe(false);
  });

  it("reports coach available when context has capability", () => {
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          context: buildContext(),
        })
      )
    );
    expect(result.current.state.canUseCoach).toBe(true);
  });
});
