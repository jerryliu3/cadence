import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { getPlannerCapabilities } from "./capabilities";

describe("planner capabilities", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("defaults to calendar on and cross-month moves off", () => {
    expect(getPlannerCapabilities()).toEqual({
      calendarEnabled: true,
      crossMonthMovesEnabled: false,
    });
  });

  it("keeps calendar enabled by default in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    resetEnvCacheForTests();
    expect(getPlannerCapabilities().calendarEnabled).toBe(true);
  });

  it("supports a global calendar disable", () => {
    vi.stubEnv("CALENDAR_ENABLED", "false");
    resetEnvCacheForTests();
    expect(getPlannerCapabilities()).toEqual({
      calendarEnabled: false,
      crossMonthMovesEnabled: false,
    });
  });

  it("accepts common copy-paste casing/whitespace variants", () => {
    vi.stubEnv("CALENDAR_ENABLED", " True \n");
    resetEnvCacheForTests();
    expect(getPlannerCapabilities().calendarEnabled).toBe(true);
    vi.stubEnv("CALENDAR_ENABLED", " FALSE\t");
    resetEnvCacheForTests();
    expect(getPlannerCapabilities().calendarEnabled).toBe(false);
  });

  it("throws on invalid boolean flag values", () => {
    vi.stubEnv("CALENDAR_ENABLED", "maybe");
    resetEnvCacheForTests();
    expect(() => getPlannerCapabilities()).toThrow(/Invalid server environment/);
  });

  it("enables cross-month moves only when explicitly flagged", () => {
    vi.stubEnv("FEATURE_CROSS_MONTH_MOVES", "true");
    resetEnvCacheForTests();
    expect(getPlannerCapabilities().crossMonthMovesEnabled).toBe(true);
  });
});
