import { describe, expect, it } from "vitest";
import {
  DUO_SURFACE_DEFAULTS,
  resolveDuoSurfaceDefault,
} from "@/lib/social/duo/surface-defaults";

describe("duo surface defaults", () => {
  it("keeps calendar on the same me default as checklist", () => {
    expect(DUO_SURFACE_DEFAULTS.insights).toBe("both");
    expect(DUO_SURFACE_DEFAULTS.checklist).toBe("me");
    expect(DUO_SURFACE_DEFAULTS.calendar).toBe("me");
    expect(resolveDuoSurfaceDefault("/calendar")).toBe("me");
    expect(resolveDuoSurfaceDefault("/insights")).toBe("both");
  });
});
