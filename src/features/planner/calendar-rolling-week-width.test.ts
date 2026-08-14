import { describe, expect, it } from "vitest";
import { ROLLING_WEEK_GRID_WIDTH_BY_VIEW } from "@/features/planner/calendar-rolling-week-width";

describe("rolling week tile widths", () => {
  it("makes 3-day tiles larger than day tiles on desktop", () => {
    expect(ROLLING_WEEK_GRID_WIDTH_BY_VIEW.day).toContain(
      "xl:[--rolling-week-cell-width:calc((100%-2rem)/4)]"
    );
    expect(ROLLING_WEEK_GRID_WIDTH_BY_VIEW.three_day).toContain(
      "xl:[--rolling-week-cell-width:calc((100%-0.5rem)/3.1)]"
    );
    expect(ROLLING_WEEK_GRID_WIDTH_BY_VIEW.three_day).not.toContain("/6)]");
  });
});
