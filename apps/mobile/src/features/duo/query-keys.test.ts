import { describe, expect, it } from "vitest";
import { buildMobilePlannerContextQueryKey } from "./query-keys";

describe("buildMobilePlannerContextQueryKey", () => {
  it("keys viewer planner context by subject and visible window", () => {
    expect(
      buildMobilePlannerContextQueryKey({
        viewerUserId: "viewer-1",
        subjectUserId: "subject-2",
        month: "2026-08",
        visibleStart: "2026-07-01",
        visibleEnd: "2026-09-30",
      })
    ).toEqual([
      "mobile-planner-context",
      "viewer-1",
      "subject-2",
      "2026-08",
      "2026-07-01",
      "2026-09-30",
    ]);
  });
});
