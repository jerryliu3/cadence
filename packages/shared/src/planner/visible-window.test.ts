import { describe, expect, it } from "vitest";
import { buildPlannerVisibleWindow } from "./visible-window";

describe("buildPlannerVisibleWindow", () => {
  it("covers the previous, current, and next calendar months", () => {
    expect(buildPlannerVisibleWindow("2026-08")).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    });
  });

  it("crosses year boundaries", () => {
    expect(buildPlannerVisibleWindow("2026-01")).toEqual({
      start: "2025-12-01",
      end: "2026-02-28",
    });
  });
});
