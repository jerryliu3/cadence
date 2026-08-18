import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { getFeatureFlags, isFeatureEnabled } from "./feature-flags";

describe("feature flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("defaults launch flags off", () => {
    expect(getFeatureFlags()).toEqual({
      crossMonthMovesEnabled: false,
      xpEnabled: false,
      socialEnabled: false,
      integrationsEnabled: false,
      journeyEnabled: false,
    });
    expect(isFeatureEnabled("crossMonthMovesEnabled")).toBe(false);
    expect(isFeatureEnabled("xpEnabled")).toBe(false);
    expect(isFeatureEnabled("socialEnabled")).toBe(false);
    expect(isFeatureEnabled("integrationsEnabled")).toBe(false);
    expect(isFeatureEnabled("journeyEnabled")).toBe(false);
  });

  it("reads the cross-month moves kill switch from env", () => {
    vi.stubEnv("FEATURE_CROSS_MONTH_MOVES", "true");
    resetEnvCacheForTests();
    expect(getFeatureFlags()).toEqual({
      crossMonthMovesEnabled: true,
      xpEnabled: false,
      socialEnabled: false,
      integrationsEnabled: false,
      journeyEnabled: false,
    });
  });

  it("reads the XP kill switch from env", () => {
    vi.stubEnv("XP_ENABLED", "true");
    resetEnvCacheForTests();
    expect(getFeatureFlags()).toEqual({
      crossMonthMovesEnabled: false,
      xpEnabled: true,
      socialEnabled: false,
      integrationsEnabled: false,
      journeyEnabled: false,
    });
  });

  it("reads the social kill switch from env", () => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    resetEnvCacheForTests();
    expect(getFeatureFlags()).toEqual({
      crossMonthMovesEnabled: false,
      xpEnabled: false,
      socialEnabled: true,
      integrationsEnabled: false,
      journeyEnabled: false,
    });
  });

  it("reads the integrations kill switch from env", () => {
    vi.stubEnv("INTEGRATIONS_ENABLED", "true");
    resetEnvCacheForTests();
    expect(getFeatureFlags()).toEqual({
      crossMonthMovesEnabled: false,
      xpEnabled: false,
      socialEnabled: false,
      integrationsEnabled: true,
      journeyEnabled: false,
    });
  });

  it("reads journey rollout flag from env", () => {
    vi.stubEnv("JOURNEY_ENABLED", "true");
    resetEnvCacheForTests();
    expect(getFeatureFlags()).toEqual({
      crossMonthMovesEnabled: false,
      xpEnabled: false,
      socialEnabled: false,
      integrationsEnabled: false,
      journeyEnabled: true,
    });
  });
});
