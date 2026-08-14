import { describe, expect, it, vi } from "vitest";
import {
  collectHealthKitSamples,
  mapHealthKitQuantitySample,
  type HealthKitBridge,
} from "./ios-healthkit";

function createBridge(
  overrides: Partial<HealthKitBridge> = {}
): HealthKitBridge {
  return {
    requestAuthorization: vi.fn(async () => true),
    queryQuantitySamplesWithAnchor: vi.fn(async () => ({
      samples: [],
      newAnchor: "anchor-1",
    })),
    enableBackgroundDelivery: vi.fn(async () => true),
    subscribeToChanges: vi.fn(() => ({ remove: vi.fn() })),
    ...overrides,
  };
}

describe("iOS HealthKit bridge", () => {
  it("maps source bundle identifiers from HealthKit samples", () => {
    const mapped = mapHealthKitQuantitySample(
      "HKQuantityTypeIdentifierStepCount",
      {
        uuid: "abc",
        quantity: 40,
        startDate: "2026-08-14T04:00:00.000Z",
        sourceRevision: {
          source: {
            bundleIdentifier: "com.apple.health",
            name: "Apple Watch",
          },
        },
      }
    );
    expect(mapped.sourceIdentifier).toBe("com.apple.health");
    expect(mapped.metricKey).toBe("steps");
  });

  it("skips unauthorized type reads instead of crashing", async () => {
    const bridge = createBridge({
      queryQuantitySamplesWithAnchor: vi.fn(async (type) => {
        if (type === "HKQuantityTypeIdentifierAppleExerciseTime") {
          throw new Error("Authorization not determined");
        }
        return {
          samples: [
            {
              uuid: "step-1",
              quantity: 12,
              startDate: "2026-08-14T04:00:00.000Z",
            },
          ],
          newAnchor: `${type}-anchor`,
        };
      }),
    });

    const result = await collectHealthKitSamples(bridge, {});
    expect(result.samples.some((sample) => sample.providerNativeId === "step-1")).toBe(
      true
    );
    expect(
      result.samples.some((sample) => sample.metricKey === "exercise_minutes")
    ).toBe(false);
  });

  it("advances anchors after a successful quantity query", async () => {
    const bridge = createBridge({
      queryQuantitySamplesWithAnchor: vi.fn(async () => ({
        samples: [],
        newAnchor: "next",
      })),
    });
    const result = await collectHealthKitSamples(bridge, {
      HKQuantityTypeIdentifierStepCount: "prev",
    });
    expect(result.nextAnchors.HKQuantityTypeIdentifierStepCount).toBe("next");
  });
});
