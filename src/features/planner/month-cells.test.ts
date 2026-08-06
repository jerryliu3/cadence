import { describe, expect, it } from "vitest";
import {
  buildMonthCells,
  buildMondayFirstMonthCells,
} from "@/features/planner/month-cells";

describe("buildMondayFirstMonthCells", () => {
  it("returns a fixed six-week Monday-first grid", () => {
    const cells = buildMondayFirstMonthCells("2026-08");

    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ date: "2026-07-27", inMonth: false });
    expect(cells[5]).toEqual({ date: "2026-08-01", inMonth: true });
    expect(cells.at(-1)).toEqual({ date: "2026-09-06", inMonth: false });
  });

  it("supports Sunday-first week layout", () => {
    const cells = buildMonthCells("2026-08", 0);

    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ date: "2026-07-26", inMonth: false });
    expect(cells[6]).toEqual({ date: "2026-08-01", inMonth: true });
    expect(cells.at(-1)).toEqual({ date: "2026-09-05", inMonth: false });
  });
});
