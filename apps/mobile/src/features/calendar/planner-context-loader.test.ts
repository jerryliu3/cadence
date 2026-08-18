import { describe, expect, it, vi } from "vitest";
import {
  createMobilePlannerContextLoader,
  type MobilePlannerContext,
} from "./planner-context-loader";

const context = {
  schemaVersion: "1" as const,
  scopeMonth: "2026-08",
  asOfDate: "2026-08-14",
  timezone: "America/New_York",
  goalTitles: {},
  links: [],
  capabilities: { crossMonthMovesEnabled: true },
  preview: null,
  activePlan: null,
  revisions: {
    canonicalRevision: 1,
    executionRevision: 1,
    scheduleDigest: null,
  },
  preferences: null,
  staleness: { stale: false, reasons: [] },
  unplaceableGoals: [],
} satisfies MobilePlannerContext;

describe("createMobilePlannerContextLoader", () => {
  it("uses prepare for the first load and context GETs afterward", async () => {
    const postJson = vi.fn(async () => context);
    const getJson = vi.fn(async () => context);
    const loader = createMobilePlannerContextLoader({ postJson, getJson });

    await expect(loader.load("2026-08")).resolves.toBe(context);
    expect(postJson).toHaveBeenCalledWith("/api/planner/prepare", {
      scopeMonth: "2026-08",
      visibleStart: "2026-07-01",
      visibleEnd: "2026-09-30",
    });
    expect(getJson).not.toHaveBeenCalled();

    await expect(loader.load("2026-09")).resolves.toBe(context);
    expect(getJson).toHaveBeenCalledWith("/api/planner/context", {
      query: {
        scopeMonth: "2026-09",
        visibleStart: "2026-08-01",
        visibleEnd: "2026-10-31",
      },
    });
    expect(postJson).toHaveBeenCalledTimes(1);
  });

  it("prepares again when explicitly forced", async () => {
    const postJson = vi.fn(async () => context);
    const getJson = vi.fn(async () => context);
    const loader = createMobilePlannerContextLoader({ postJson, getJson });

    await loader.load("2026-08");
    await loader.forcePrepare("2026-09");

    expect(postJson).toHaveBeenLastCalledWith("/api/planner/prepare", {
      scopeMonth: "2026-09",
      visibleStart: "2026-08-01",
      visibleEnd: "2026-10-31",
    });
    expect(postJson).toHaveBeenCalledTimes(2);
    expect(getJson).not.toHaveBeenCalled();
  });

  it("resets preparation when the authenticated viewer changes", async () => {
    const postJson = vi.fn(async () => context);
    const getJson = vi.fn(async () => context);
    const loader = createMobilePlannerContextLoader({ postJson, getJson });

    await loader.load("2026-08");
    loader.reset();
    await loader.load("2026-08");

    expect(postJson).toHaveBeenCalledTimes(2);
    expect(getJson).not.toHaveBeenCalled();
  });
});
