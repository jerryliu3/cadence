import { describe, expect, it } from "vitest";
import { getLocalScheduleSlot } from "@/lib/push/schedule";

describe("getLocalScheduleSlot", () => {
  it("returns the local date and hour for an IANA timezone", () => {
    expect(
      getLocalScheduleSlot(new Date("2026-08-02T15:00:00.000Z"), "America/New_York")
    ).toEqual({
      date: "2026-08-02",
      hour: 11,
    });
  });

  it("handles a timezone on the next local date", () => {
    expect(
      getLocalScheduleSlot(new Date("2026-08-02T15:00:00.000Z"), "Pacific/Auckland")
    ).toEqual({
      date: "2026-08-03",
      hour: 3,
    });
  });

  it("throws for an invalid timezone", () => {
    expect(() =>
      getLocalScheduleSlot(new Date("2026-08-02T15:00:00.000Z"), "Not/A_Timezone")
    ).toThrow();
  });
});
