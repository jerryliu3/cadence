import { describe, expect, it } from "vitest";
import {
  DUO_SURFACE_DEFAULTS,
  resolveDuoLanes,
  resolveEffectiveDuoScope,
  resolveDuoSurfaceDefault,
  shouldClampDuoScopePreference,
} from "@cadence/shared/social/duo";

describe("duo surface defaults", () => {
  it("keeps calendar on the same me default as checklist", () => {
    expect(DUO_SURFACE_DEFAULTS.insights).toBe("both");
    expect(DUO_SURFACE_DEFAULTS.checklist).toBe("me");
    expect(DUO_SURFACE_DEFAULTS.calendar).toBe("me");
    expect(resolveDuoSurfaceDefault("/calendar")).toBe("me");
    expect(resolveDuoSurfaceDefault("/insights")).toBe("both");
  });

  it("resolves effective scope from partner availability and preference", () => {
    expect(
      resolveEffectiveDuoScope({
        availability: "ready",
        hasActivePartner: true,
        scopePreference: "both",
        surfaceDefault: "me",
      })
    ).toEqual({
      hasActivePartner: true,
      scope: "both",
    });
    expect(
      resolveEffectiveDuoScope({
        availability: "ready",
        hasActivePartner: false,
        scopePreference: "partner",
        surfaceDefault: "both",
      })
    ).toEqual({
      hasActivePartner: false,
      scope: "me",
    });
  });

  it("resolves lane subjects from effective scope", () => {
    const viewer = { id: "viewer" as const, label: "Mine", readOnly: false };
    const partner = { id: "partner" as const, label: "Alex", readOnly: true };
    expect(
      resolveDuoLanes({
        scope: "partner",
        viewer,
        partner,
      }).map((lane) => lane.id)
    ).toEqual(["partner"]);
    expect(
      resolveDuoLanes({
        scope: "both",
        viewer,
        partner: null,
      }).map((lane) => lane.id)
    ).toEqual(["viewer"]);
  });

  it("clamps stale partner scope preferences only in ready no-partner state", () => {
    expect(
      shouldClampDuoScopePreference({
        availability: "ready",
        hasActivePartner: false,
        scopePreference: "both",
      })
    ).toBe(true);
    expect(
      shouldClampDuoScopePreference({
        availability: "unavailable",
        hasActivePartner: false,
        scopePreference: "both",
      })
    ).toBe(false);
  });
});
