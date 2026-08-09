import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPlannerCoachQuotaLimit,
  shouldBypassPlannerCoachQuota,
} from "./ai-quota";

describe("planner AI quota limits", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps local bypass behavior for coach development mode", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CALENDAR_COACH_DISABLE_QUOTA", "true");

    expect(shouldBypassPlannerCoachQuota()).toBe(true);
    expect(readPlannerCoachQuotaLimit()).toBe(1_000_000);
  });

  it("clamps non-bypass coach limit above provider maximum", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CALENDAR_COACH_DISABLE_QUOTA", "false");
    vi.stubEnv("CALENDAR_COACH_DAILY_LIMIT", "500");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(readPlannerCoachQuotaLimit()).toBe(100);
    expect(warnSpy).toHaveBeenCalledWith(
      "[planner-ai-quota] CALENDAR_COACH_DAILY_LIMIT exceeds provider limit 100; clamping."
    );
  });

  it("uses explicit in-range coach limits", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CALENDAR_COACH_DISABLE_QUOTA", "false");
    vi.stubEnv("CALENDAR_COACH_DAILY_LIMIT", "75");

    expect(readPlannerCoachQuotaLimit()).toBe(75);
  });
});
