import { describe, expect, it } from "vitest";
import { resolveGoalLinkRole } from "@/lib/planner/link-role";

describe("resolveGoalLinkRole", () => {
  it("returns none for unlinked goals", () => {
    expect(resolveGoalLinkRole("goal-a", [])).toBe("none");
  });

  it("returns source for goals that only source links", () => {
    expect(
      resolveGoalLinkRole("goal-a", [
        { sourceGoalId: "goal-a", targetGoalId: "goal-b" },
      ])
    ).toBe("source");
  });

  it("returns target for goals that only target links", () => {
    expect(
      resolveGoalLinkRole("goal-b", [
        { sourceGoalId: "goal-a", targetGoalId: "goal-b" },
      ])
    ).toBe("target");
  });

  it("prefers target when a goal is both source and target", () => {
    expect(
      resolveGoalLinkRole("goal-b", [
        { sourceGoalId: "goal-a", targetGoalId: "goal-b" },
        { sourceGoalId: "goal-b", targetGoalId: "goal-c" },
      ])
    ).toBe("target");
  });
});
