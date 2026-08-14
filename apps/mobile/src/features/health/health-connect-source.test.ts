import { describe, expect, it } from "vitest";
import {
  isOnDeviceHealthConnectOrigin,
  resolveHealthConnectSourceIdentifier,
} from "./health-connect-source";

describe("Health Connect source identity", () => {
  it("keeps synthetic package names instead of assuming android", () => {
    const spn =
      "com.android.healthconnect.phone.jd5bdd37e1a8d3667a05d0abebfc4a89e";
    expect(
      resolveHealthConnectSourceIdentifier({
        dataOrigin: { packageName: spn },
        currentDeviceSpn: spn,
      })
    ).toBe(spn);
  });

  it("preserves historical android origins alongside the current SPN", () => {
    expect(
      isOnDeviceHealthConnectOrigin(
        "android",
        "com.android.healthconnect.phone.abc"
      )
    ).toBe(true);
    expect(
      isOnDeviceHealthConnectOrigin(
        "com.google.android.apps.fitness",
        "com.android.healthconnect.phone.abc"
      )
    ).toBe(false);
  });

  it("falls back to the current SPN when DataOrigin is missing", () => {
    expect(
      resolveHealthConnectSourceIdentifier({
        dataOrigin: null,
        currentDeviceSpn: "com.android.healthconnect.phone.abc",
      })
    ).toBe("com.android.healthconnect.phone.abc");
  });
});
