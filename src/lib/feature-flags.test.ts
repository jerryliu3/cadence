import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { getFeatureFlags, isFeatureEnabled } from "./feature-flags";

describe("feature flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("defaults cross-month moves off", () => {
    expect(getFeatureFlags()).toEqual({
      crossMonthMovesEnabled: false,
      xpEnabled: false,
    });
    expect(isFeatureEnabled("crossMonthMovesEnabled")).toBe(false);
    expect(isFeatureEnabled("xpEnabled")).toBe(false);
  });

  it("reads the cross-month moves kill switch from env", () => {
    vi.stubEnv("FEATURE_CROSS_MONTH_MOVES", "true");
    resetEnvCacheForTests();
    expect(getFeatureFlags()).toEqual({
      crossMonthMovesEnabled: true,
      xpEnabled: false,
    });
  });

  it("reads the XP kill switch from env", () => {
    vi.stubEnv("XP_ENABLED", "true");
    resetEnvCacheForTests();
    expect(getFeatureFlags()).toEqual({
      crossMonthMovesEnabled: false,
      xpEnabled: true,
    });
  });
});
