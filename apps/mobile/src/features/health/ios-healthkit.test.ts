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

    const now = new Date("2026-08-14T16:00:00.000Z");
    const result = await collectHealthKitSamples(bridge, {}, now);
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

  it("drops samples outside today/yesterday and collects deletions", async () => {
    const now = new Date("2026-08-14T16:00:00.000Z");
    const bridge = createBridge({
      queryQuantitySamplesWithAnchor: vi.fn(async (type) => {
        if (type !== "HKQuantityTypeIdentifierStepCount") {
          return { samples: [], deletedSamples: [], newAnchor: `${type}-anchor` };
        }
        return {
          samples: [
            {
              uuid: "old",
              quantity: 40,
              startDate: "2020-01-01T04:00:00.000Z",
            },
            {
              uuid: "today",
              quantity: 12,
              startDate: "2026-08-14T04:00:00.000Z",
            },
          ],
          deletedSamples: [{ uuid: "gone" }],
          newAnchor: "step-anchor",
        };
      }),
    });
    const result = await collectHealthKitSamples(bridge, {}, now);
    expect(result.samples.map((sample) => sample.providerNativeId)).toEqual([
      "today",
    ]);
    expect(result.deletedNativeIds).toEqual(["gone"]);
  });
});
