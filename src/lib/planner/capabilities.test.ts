import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { getPlannerCapabilities } from "./capabilities";

describe("planner capabilities", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("defaults to cross-month moves off", () => {
    expect(getPlannerCapabilities()).toEqual({
      crossMonthMovesEnabled: false,
    });
  });

  it("enables cross-month moves only when explicitly flagged", () => {
    vi.stubEnv("FEATURE_CROSS_MONTH_MOVES", "true");
    resetEnvCacheForTests();
    expect(getPlannerCapabilities().crossMonthMovesEnabled).toBe(true);
  });
});
