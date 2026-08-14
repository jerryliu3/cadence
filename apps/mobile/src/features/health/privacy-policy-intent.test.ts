import { describe, expect, it } from "vitest";
import {
  HEALTH_CONNECT_RATIONALE_ACTION,
  HEALTH_PRIVACY_PATH,
  shouldOpenHealthPrivacyPolicy,
} from "./privacy-policy-intent";

describe("Health Connect privacy-policy intent routing", () => {
  it("routes the Play rationale action to in-app policy content", () => {
    expect(
      shouldOpenHealthPrivacyPolicy(
        `intent://privacy#Intent;action=${HEALTH_CONNECT_RATIONALE_ACTION};end`
      )
    ).toBe(true);
    expect(HEALTH_PRIVACY_PATH).toBe("/privacy");
  });

  it("does not treat a cold MainActivity launch as policy content", () => {
    expect(shouldOpenHealthPrivacyPolicy("cadence://")).toBe(false);
    expect(shouldOpenHealthPrivacyPolicy("cadence://(tabs)/settings")).toBe(
      false
    );
  });
});
