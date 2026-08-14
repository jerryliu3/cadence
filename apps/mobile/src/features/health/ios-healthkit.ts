import type { HealthMetricKey } from "@cadence/shared/health/providers";
import { withHealthKitAuthorizationGuard } from "./authorization-guard";
import {
  toIngestSample,
  utcOffsetMinutesFromInstant,
  type NormalizedHealthSample,
} from "./ingest-payload";

export const HEALTHKIT_QUANTITY_TYPES = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierAppleExerciseTime",
] as const;

export type HealthKitQuantityType = (typeof HEALTHKIT_QUANTITY_TYPES)[number];

export interface HealthKitQuantitySampleLike {
  uuid: string;
  quantity: number;
  startDate: Date | string;
  endDate?: Date | string;
  sourceRevision?: {
    source?: {
      bundleIdentifier?: string;
      name?: string;
    };
  };
}

export interface HealthKitAnchorQueryResult {
  samples: HealthKitQuantitySampleLike[];
  deletedSamples?: unknown[];
  newAnchor?: string;
}

export interface HealthKitBridge {
  requestAuthorization: (input: {
    toRead: string[];
  }) => Promise<boolean>;
  queryQuantitySamplesWithAnchor: (
    type: HealthKitQuantityType,
    options: { limit: number; anchor?: string }
  ) => Promise<HealthKitAnchorQueryResult>;
  enableBackgroundDelivery: (
    type: string,
    frequency: number
  ) => Promise<boolean>;
  subscribeToChanges: (
    type: string,
    onChange: () => void
  ) => { remove: () => void };
}

const METRIC_BY_TYPE: Record<
  HealthKitQuantityType,
  { metricKey: HealthMetricKey; unit: string }
> = {
  HKQuantityTypeIdentifierStepCount: { metricKey: "steps", unit: "count" },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    metricKey: "active_energy_kcal",
    unit: "kcal",
  },
  HKQuantityTypeIdentifierDistanceWalkingRunning: {
    metricKey: "distance_meters",
    unit: "m",
  },
  HKQuantityTypeIdentifierAppleExerciseTime: {
    metricKey: "exercise_minutes",
    unit: "min",
  },
};

export function mapHealthKitQuantitySample(
  type: HealthKitQuantityType,
  sample: HealthKitQuantitySampleLike
): NormalizedHealthSample {
  const startedAt = new Date(sample.startDate);
  const endedAt = sample.endDate ? new Date(sample.endDate) : undefined;
  const mapping = METRIC_BY_TYPE[type];
  return {
    providerNativeId: sample.uuid,
    sourceIdentifier:
      sample.sourceRevision?.source?.bundleIdentifier?.trim() ||
      "com.apple.health",
    sourceName: sample.sourceRevision?.source?.name,
    metricKey: mapping.metricKey,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt?.toISOString(),
    utcOffsetMinutes: utcOffsetMinutesFromInstant(startedAt),
    valueNumeric: sample.quantity,
    unit: mapping.unit,
  };
}

export async function collectHealthKitSamples(
  bridge: HealthKitBridge,
  anchors: Partial<Record<HealthKitQuantityType, string>>
): Promise<{
  samples: ReturnType<typeof toIngestSample>[];
  nextAnchors: Partial<Record<HealthKitQuantityType, string>>;
}> {
  await bridge.requestAuthorization({
    toRead: [...HEALTHKIT_QUANTITY_TYPES],
  });

  const nextAnchors: Partial<Record<HealthKitQuantityType, string>> = {
    ...anchors,
  };
  const samples: ReturnType<typeof toIngestSample>[] = [];

  for (const type of HEALTHKIT_QUANTITY_TYPES) {
    const result = await withHealthKitAuthorizationGuard(
      () =>
        bridge.queryQuantitySamplesWithAnchor(type, {
          limit: 200,
          anchor: anchors[type],
        }),
      { samples: [], newAnchor: anchors[type] }
    );
    for (const sample of result.samples) {
      samples.push(toIngestSample(mapHealthKitQuantitySample(type, sample)));
    }
    if (result.newAnchor) {
      nextAnchors[type] = result.newAnchor;
    }
  }

  return { samples, nextAnchors };
}

export async function enableHealthKitBackgroundDelivery(bridge: HealthKitBridge) {
  for (const type of HEALTHKIT_QUANTITY_TYPES) {
    await withHealthKitAuthorizationGuard(
      () => bridge.enableBackgroundDelivery(type, 1),
      false
    );
  }
}
