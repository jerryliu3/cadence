import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { getFeatureFlags, isFeatureEnabled } from "./feature-flags";

describe("feature flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("exposes conservative defaults for uncertain launches", () => {
    expect(getFeatureFlags()).toEqual({
      calendarEnabled: true,
      crossMonthMovesEnabled: false,
    });
    expect(isFeatureEnabled("crossMonthMovesEnabled")).toBe(false);
  });

  it("reads kill switches from env", () => {
    vi.stubEnv("CALENDAR_ENABLED", "false");
    vi.stubEnv("FEATURE_CROSS_MONTH_MOVES", "true");
    resetEnvCacheForTests();
    expect(getFeatureFlags()).toEqual({
      calendarEnabled: false,
      crossMonthMovesEnabled: true,
    });
  });
});
