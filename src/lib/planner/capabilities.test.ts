import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlannerCapabilities } from "./capabilities";

describe("planner capabilities", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps only the exact-date compatibility bridge enabled by default", () => {
    expect(getPlannerCapabilities("owner-id")).toEqual({
      plannerRead: false,
      plannerGeneration: false,
      plannerPlanWrites: false,
      targetedExactCompletion: true,
      coachAi: false,
      overlap: false,
    });
  });

  it("keeps the compatibility bridge enabled by default in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      getPlannerCapabilities("owner-id").targetedExactCompletion
    ).toBe(true);
  });

  it("supports an exact-date emergency disable without legacy fallback", () => {
    vi.stubEnv("CALENDAR_TARGETED_EXACT_COMPLETION_ENABLED", "false");
    expect(
      getPlannerCapabilities("owner-id").targetedExactCompletion
    ).toBe(false);
  });

  it("applies owner allowlists", () => {
    vi.stubEnv("CALENDAR_PLANNER_READ_ENABLED", "true");
    vi.stubEnv(
      "CALENDAR_PLANNER_READ_ENABLED_OWNER_ALLOWLIST",
      "allowed-owner"
    );

    expect(getPlannerCapabilities("allowed-owner").plannerRead).toBe(true);
    expect(getPlannerCapabilities("other-owner").plannerRead).toBe(false);
  });

  it("rejects invalid capability combinations", () => {
    vi.stubEnv("CALENDAR_PLANNER_GENERATION_ENABLED", "true");
    expect(() => getPlannerCapabilities("owner-id")).toThrow(
      "require CALENDAR_PLANNER_READ_ENABLED"
    );
  });
});
