import { describe, expect, it } from "vitest";
import { resolveMode } from "@/features/goals/goal-creation-entry";

describe("resolveMode", () => {
  it("defaults to single mode without a mode or starter pack", () => {
    expect(resolveMode(null, false, null)).toBe("single");
  });

  it("keeps explicit multi mode", () => {
    expect(resolveMode("multi", false, null)).toBe("multi");
  });

  it("auto-selects multi mode when a starter pack is present", () => {
    expect(resolveMode(null, false, "health")).toBe("multi");
  });

  it("allows training mode only when the flag is enabled", () => {
    expect(resolveMode("training", true, null)).toBe("training");
    expect(resolveMode("training", false, null)).toBe("single");
  });
});
