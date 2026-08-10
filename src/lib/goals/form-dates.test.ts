import { describe, expect, it } from "vitest";
import {
  getThisMonthEndDate,
  getThisMonthStartDate,
  getThisYearEndDate,
  getThisYearStartDate,
} from "./form-dates";

describe("goal form date helpers", () => {
  const reference = new Date("2026-08-10T12:00:00.000Z");

  it("builds month boundary dates", () => {
    expect(getThisMonthStartDate(reference)).toBe("2026-08-01");
    expect(getThisMonthEndDate(reference)).toBe("2026-08-31");
  });

  it("builds year boundary dates", () => {
    expect(getThisYearStartDate(reference)).toBe("2026-01-01");
    expect(getThisYearEndDate(reference)).toBe("2026-12-31");
  });
});
