import { describe, expect, it } from "vitest";
import { getScopeDateRange } from "@/lib/planner/dates";

describe("planner month scope dates", () => {
  it("derives leap-month bounds", () => {
    expect(getScopeDateRange("2028-02")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("rejects impossible calendar months", () => {
    expect(() => getScopeDateRange("2026-13")).toThrow(RangeError);
  });
});
