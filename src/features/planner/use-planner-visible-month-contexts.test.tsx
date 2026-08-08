import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlannerVisibleMonthContexts } from "@/features/planner/use-planner-visible-month-contexts";

describe("usePlannerVisibleMonthContexts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads only non-scope month planner contexts", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("scopeMonth=2026-07")) {
        return Response.json({
          schemaVersion: "1",
          scopeMonth: "2026-07",
          asOfDate: "2026-07-31",
          timezone: "UTC",
          goalTitles: { "goal-july": "July Goal" },
          preferences: null,
          capabilities: {
            plannerRead: true,
            plannerGeneration: true,
            plannerPlanWrites: true,
            targetedExactCompletion: true,
            coachAi: true,
            overlap: true,
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
        });
      }
      if (url.includes("scopeMonth=2026-09")) {
        return Response.json({
          schemaVersion: "1",
          scopeMonth: "2026-09",
          asOfDate: "2026-09-01",
          timezone: "UTC",
          goalTitles: { "goal-sept": "September Goal" },
          preferences: null,
          capabilities: {
            plannerRead: true,
            plannerGeneration: true,
            plannerPlanWrites: true,
            targetedExactCompletion: true,
            coachAi: true,
            overlap: true,
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
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const visibleDays = [
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-09-01",
      "2026-09-02",
    ];

    const { result } = renderHook(() =>
      usePlannerVisibleMonthContexts({
        activeTab: "calendar",
        scopeMonth: "2026-08",
        visibleDays,
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(result.current["2026-07"]?.scopeMonth).toBe("2026-07");
    expect(result.current["2026-09"]?.scopeMonth).toBe("2026-09");
    expect(result.current["2026-08"]).toBeUndefined();
  });
});
