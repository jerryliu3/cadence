import { describe, expect, it } from "vitest";
import { healthLocalDateFromOffset } from "@cadence/shared/health/local-date";

describe("healthLocalDateFromOffset", () => {
  it("keeps the local calendar day at local midnight", () => {
    expect(
      healthLocalDateFromOffset("2026-08-14T04:00:00.000Z", -240)
    ).toBe("2026-08-14");
  });

  it("crosses the previous local day without using a profile timezone", () => {
    expect(
      healthLocalDateFromOffset("2026-08-14T03:59:00.000Z", -240)
    ).toBe("2026-08-13");
  });

  it("rejects offsets outside the schema range", () => {
    expect(() =>
      healthLocalDateFromOffset("2026-08-14T00:00:00.000Z", -841)
    ).toThrow(/utc_offset_minutes/);
  });
});
