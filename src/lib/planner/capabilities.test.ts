import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlannerCapabilities } from "./capabilities";

describe("planner capabilities", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to one enabled calendar capability set", () => {
    expect(getPlannerCapabilities()).toEqual({
      calendarEnabled: true,
    });
  });

  it("keeps calendar enabled by default in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getPlannerCapabilities().calendarEnabled).toBe(true);
  });

  it("supports a global calendar disable", () => {
    vi.stubEnv("CALENDAR_ENABLED", "false");
    expect(getPlannerCapabilities()).toEqual({
      calendarEnabled: false,
    });
  });

  it("accepts common copy-paste casing/whitespace variants", () => {
    vi.stubEnv("CALENDAR_ENABLED", " True \n");
    expect(getPlannerCapabilities().calendarEnabled).toBe(true);
    vi.stubEnv("CALENDAR_ENABLED", " FALSE\t");
    expect(getPlannerCapabilities().calendarEnabled).toBe(false);
  });

  it("falls back to default on invalid values without throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("CALENDAR_ENABLED", "maybe");
    expect(getPlannerCapabilities().calendarEnabled).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid CALENDAR_ENABLED value")
    );
    warnSpy.mockRestore();
  });

  it("keeps the global planner gate tied to calendar enablement", () => {
    expect(getPlannerCapabilities().calendarEnabled).toBe(true);

    vi.stubEnv("CALENDAR_ENABLED", "false");
    expect(getPlannerCapabilities().calendarEnabled).toBe(false);
  });
});
