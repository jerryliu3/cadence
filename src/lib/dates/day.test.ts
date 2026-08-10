import { describe, expect, it } from "vitest";
import { resolveSelectedDateState, toLocalDateString } from "./day";

describe("day helpers", () => {
  it("formats local dates as yyyy-MM-dd", () => {
    expect(toLocalDateString(new Date("2026-08-10T12:00:00.000Z"))).toBe(
      "2026-08-10"
    );
  });

  it("resolves relative selected-date state", () => {
    expect(resolveSelectedDateState("2026-08-09", "2026-08-10")).toBe("past");
    expect(resolveSelectedDateState("2026-08-10", "2026-08-10")).toBe("today");
    expect(resolveSelectedDateState("2026-08-11", "2026-08-10")).toBe("future");
  });
});
