import { describe, expect, it } from "vitest";
import {
  HEALTH_CONNECT_RATIONALE_ACTION,
  HEALTH_PRIVACY_PATH,
  redirectHealthPrivacySystemPath,
  shouldOpenHealthPrivacyPolicy,
} from "./privacy-policy-intent";

describe("Health Connect privacy-policy intent routing", () => {
  it("routes Play rationale and permission-usage actions to in-app policy content", () => {
    expect(
      shouldOpenHealthPrivacyPolicy(HEALTH_CONNECT_RATIONALE_ACTION)
    ).toBe(true);
    expect(
      shouldOpenHealthPrivacyPolicy("android.intent.action.VIEW_PERMISSION_USAGE")
    ).toBe(true);
    expect(HEALTH_PRIVACY_PATH).toBe("/privacy");
    expect(
      redirectHealthPrivacySystemPath(HEALTH_CONNECT_RATIONALE_ACTION)
    ).toBe("/privacy");
  });

  it("does not treat a cold MainActivity launch as policy content", () => {
    expect(shouldOpenHealthPrivacyPolicy("cadence://")).toBe(false);
    expect(shouldOpenHealthPrivacyPolicy("cadence://(tabs)/settings")).toBe(
      false
    );
    expect(redirectHealthPrivacySystemPath("cadence://(tabs)/settings")).toBe(
      "cadence://(tabs)/settings"
    );
  });
});
