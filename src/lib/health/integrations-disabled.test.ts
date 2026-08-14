import { describe, expect, it } from "vitest";
import {
  isIntegrationsEnabledForUser,
  parseIntegrationsAllowlist,
} from "./integrations-disabled";

describe("integrations rollout access", () => {
  it("parses a comma-separated allowlist", () => {
    expect(
      parseIntegrationsAllowlist(
        " 11111111-1111-4111-8111-111111111111, 22222222-2222-4222-8222-222222222222 "
      )
    ).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("allows every user when the flag is on and the allowlist is empty", () => {
    expect(
      isIntegrationsEnabledForUser("11111111-1111-4111-8111-111111111111", {
        enabled: true,
        allowlist: [],
      })
    ).toBe(true);
  });

  it("restricts internal cohort users when an allowlist is set", () => {
    expect(
      isIntegrationsEnabledForUser("11111111-1111-4111-8111-111111111111", {
        enabled: true,
        allowlist: ["11111111-1111-4111-8111-111111111111"],
      })
    ).toBe(true);
    expect(
      isIntegrationsEnabledForUser("22222222-2222-4222-8222-222222222222", {
        enabled: true,
        allowlist: ["11111111-1111-4111-8111-111111111111"],
      })
    ).toBe(false);
  });
});
