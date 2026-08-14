import { describe, expect, it } from "vitest";
import type { DuoScope } from "@cadence/shared/social/duo";
import {
  createDuoScopePreferenceStorageKey,
  parseStoredDuoScopePreference,
  shouldClearStoredScopePreference,
} from "./scope-preference";

describe("duo scope preference storage", () => {
  it("uses a per-user storage key", () => {
    expect(createDuoScopePreferenceStorageKey("user-1")).toBe(
      "mobile:duo:scope:user-1"
    );
    expect(createDuoScopePreferenceStorageKey("user-2")).toBe(
      "mobile:duo:scope:user-2"
    );
  });

  it("parses only me, partner, or both", () => {
    expect(parseStoredDuoScopePreference("me")).toBe("me");
    expect(parseStoredDuoScopePreference("partner")).toBe("partner");
    expect(parseStoredDuoScopePreference("both")).toBe("both");
    expect(parseStoredDuoScopePreference("unknown")).toBeNull();
    expect(parseStoredDuoScopePreference(null)).toBeNull();
  });

  it("clears stale partner scope only when ready confirms no partner", () => {
    const stalePreference: DuoScope = "both";
    expect(
      shouldClearStoredScopePreference({
        socialEnabled: true,
        availability: "ready",
        hasActivePartner: false,
        scopePreference: stalePreference,
      })
    ).toBe(true);
    expect(
      shouldClearStoredScopePreference({
        socialEnabled: true,
        availability: "unavailable",
        hasActivePartner: false,
        scopePreference: stalePreference,
      })
    ).toBe(false);
    expect(
      shouldClearStoredScopePreference({
        socialEnabled: false,
        availability: "ready",
        hasActivePartner: false,
        scopePreference: stalePreference,
      })
    ).toBe(false);
  });
});
