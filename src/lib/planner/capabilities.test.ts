import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlannerCapabilities } from "./capabilities";

describe("planner capabilities", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to one enabled calendar capability set", () => {
    expect(getPlannerCapabilities()).toEqual({
      calendarEnabled: true,
      plannerRead: true,
      plannerGeneration: true,
      plannerPlanWrites: true,
      targetedExactCompletion: true,
      coachAi: false,
      overlap: true,
    });
  });

  it("enables coach AI only with explicit opt-in", () => {
    vi.stubEnv("CALENDAR_COACH_AI_ENABLED", "true");
    expect(getPlannerCapabilities().coachAi).toBe(true);
  });

  it("keeps calendar enabled by default in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getPlannerCapabilities().calendarEnabled).toBe(true);
  });

  it("supports a global calendar disable", () => {
    vi.stubEnv("CALENDAR_ENABLED", "false");
    expect(getPlannerCapabilities()).toEqual({
      calendarEnabled: false,
      plannerRead: false,
      plannerGeneration: false,
      plannerPlanWrites: false,
      targetedExactCompletion: false,
      coachAi: false,
      overlap: false,
    });
  });

  it("rejects invalid flag string values", () => {
    vi.stubEnv("CALENDAR_ENABLED", "maybe");
    expect(() => getPlannerCapabilities()).toThrow(
      "Invalid feature flag value"
    );
  });

  it("rejects invalid coach flag values", () => {
    vi.stubEnv("CALENDAR_COACH_AI_ENABLED", "maybe");
    expect(() => getPlannerCapabilities()).toThrow(
      "Invalid feature flag value"
    );
  });
});
