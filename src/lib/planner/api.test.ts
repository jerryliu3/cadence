import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerRouteError, resolveCanonicalAsOfDate } from "@/lib/planner/api";

describe("resolveCanonicalAsOfDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T13:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the canonical server-local day when asOfDate is omitted", () => {
    expect(
      resolveCanonicalAsOfDate({
        timezone: "UTC",
      })
    ).toBe("2026-08-05");
  });

  it("accepts an explicitly matching asOfDate", () => {
    expect(
      resolveCanonicalAsOfDate({
        timezone: "Pacific/Auckland",
        requestedAsOfDate: "2026-08-06",
      })
    ).toBe("2026-08-06");
  });

  it("rejects a conflicting asOfDate", () => {
    expect(() =>
      resolveCanonicalAsOfDate({
        timezone: "UTC",
        requestedAsOfDate: "2026-08-04",
      })
    ).toThrowError(PlannerRouteError);

    try {
      resolveCanonicalAsOfDate({
        timezone: "UTC",
        requestedAsOfDate: "2026-08-04",
      });
    } catch (error) {
      const routeError = error as PlannerRouteError;
      expect(routeError.status).toBe(409);
      expect(routeError.code).toBe("as_of_date_conflict");
      expect(routeError.details).toEqual({ canonicalAsOfDate: "2026-08-05" });
    }
  });
});
