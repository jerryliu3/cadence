import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlannerVisibleMonthContexts } from "@/features/planner/use-planner-visible-month-contexts";
import { resetTabDataCacheForTests } from "@/lib/cache/tab-data-cache";

describe("usePlannerVisibleMonthContexts", () => {
  const visibleDays = [
    "2026-07-30",
    "2026-07-31",
    "2026-08-01",
    "2026-08-02",
    "2026-09-01",
    "2026-09-02",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTabDataCacheForTests();
    window.sessionStorage.clear();
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
            crossMonthMovesEnabled: false,
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
            crossMonthMovesEnabled: false,
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

    const { result } = renderHook(() =>
      usePlannerVisibleMonthContexts({
        activeTab: "calendar",
        scopeMonth: "2026-08",
        visibleDays,
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current["2026-07"]?.scopeMonth).toBe("2026-07");
      expect(result.current["2026-09"]?.scopeMonth).toBe("2026-09");
      expect(result.current["2026-08"]).toBeUndefined();
    });
  });

  it("keeps successful month contexts when one fetch fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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
            crossMonthMovesEnabled: false,
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
        return new Response("boom", { status: 500 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

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
    await waitFor(() => {
      expect(result.current["2026-07"]?.scopeMonth).toBe("2026-07");
    });
    expect(result.current["2026-09"]).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "[planner-visible-contexts] failed to load month context",
      expect.objectContaining({
        scopeMonth: "2026-08",
        visibleMonth: "2026-09",
      })
    );
    errorSpy.mockRestore();
  });

  it("reuses visible-month contexts across remounts within the cache window", async () => {
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
            crossMonthMovesEnabled: false,
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
            crossMonthMovesEnabled: false,
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

    const first = renderHook(() =>
      usePlannerVisibleMonthContexts({
        activeTab: "calendar",
        scopeMonth: "2026-08",
        visibleDays,
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(first.result.current["2026-07"]?.scopeMonth).toBe("2026-07");
      expect(first.result.current["2026-09"]?.scopeMonth).toBe("2026-09");
    });
    first.unmount();

    const second = renderHook(() =>
      usePlannerVisibleMonthContexts({
        activeTab: "calendar",
        scopeMonth: "2026-08",
        visibleDays,
      })
    );

    await waitFor(() => {
      expect(second.result.current["2026-07"]?.scopeMonth).toBe("2026-07");
      expect(second.result.current["2026-09"]?.scopeMonth).toBe("2026-09");
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });
});
