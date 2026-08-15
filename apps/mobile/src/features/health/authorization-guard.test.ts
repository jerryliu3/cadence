import { describe, expect, it } from "vitest";
import {
  isUnauthorizedHealthKitError,
  withHealthKitAuthorizationGuard,
} from "./authorization-guard";

describe("HealthKit authorization guards", () => {
  it("treats unauthorized native errors as safe skips", () => {
    expect(
      isUnauthorizedHealthKitError(
        new Error("Authorization not determined for HKQuantityTypeIdentifierStepCount")
      )
    ).toBe(true);
  });

  it("returns the fallback instead of crashing on unauthorized reads", async () => {
    const result = await withHealthKitAuthorizationGuard(async () => {
      throw new Error("HKErrorAuthorizationNotDetermined Code=5 Authorization not determined");
    }, { samples: [] });
    expect(result).toEqual({ samples: [] });
  });

  it("does not swallow locked-device HealthKit failures as unauthorized", async () => {
    await expect(
      withHealthKitAuthorizationGuard(async () => {
        throw new Error("HKErrorDomain Code=6 HKErrorDatabaseInaccessible");
      }, { samples: [] })
    ).rejects.toThrow(/DatabaseInaccessible/);
  });

  it("rethrows unexpected errors", async () => {
    await expect(
      withHealthKitAuthorizationGuard(async () => {
        throw new Error("disk full");
      }, null)
    ).rejects.toThrow(/disk full/);
  });
});
