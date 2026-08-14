import type { HealthMetricKey } from "@cadence/shared/health/providers";
import { healthLocalDateFromOffset } from "@cadence/shared/health/local-date";
import {
  healthNativeQueryRange,
  isHealthLocalDateInLookback,
} from "@cadence/shared/health/sync-window";
import { withHealthKitAuthorizationGuard } from "./authorization-guard";
import {
  localDateForSample,
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

export interface HealthKitDeletedSampleLike {
  uuid?: string;
}

export interface HealthKitAnchorQueryResult {
  samples: HealthKitQuantitySampleLike[];
  deletedSamples?: HealthKitDeletedSampleLike[];
  newAnchor?: string;
}

export interface HealthKitBridge {
  requestAuthorization: (input: {
    toRead: string[];
  }) => Promise<boolean>;
  queryQuantitySamplesWithAnchor: (
    type: HealthKitQuantityType,
    options: {
      limit: number;
      anchor?: string;
      filter?: { date?: { startDate?: Date; endDate?: Date } };
    }
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

const ANCHOR_PAGE_LIMIT = 200;
const ANCHOR_PAGE_CAP = 50;

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
  anchors: Partial<Record<HealthKitQuantityType, string>>,
  now = new Date()
): Promise<{
  samples: ReturnType<typeof toIngestSample>[];
  deletedNativeIds: string[];
  nextAnchors: Partial<Record<HealthKitQuantityType, string>>;
}> {
  await bridge.requestAuthorization({
    toRead: [...HEALTHKIT_QUANTITY_TYPES],
  });

  const nextAnchors: Partial<Record<HealthKitQuantityType, string>> = {
    ...anchors,
  };
  const samples: ReturnType<typeof toIngestSample>[] = [];
  const deletedNativeIds: string[] = [];
  const localToday = healthLocalDateFromOffset(
    now,
    utcOffsetMinutesFromInstant(now)
  );
  const queryRange = healthNativeQueryRange(now);

  for (const type of HEALTHKIT_QUANTITY_TYPES) {
    let anchor = anchors[type];
    for (let page = 0; page < ANCHOR_PAGE_CAP; page += 1) {
      const result = await withHealthKitAuthorizationGuard(
        () =>
          bridge.queryQuantitySamplesWithAnchor(type, {
            limit: ANCHOR_PAGE_LIMIT,
            anchor,
            filter: {
              date: {
                startDate: queryRange.start,
                endDate: queryRange.end,
              },
            },
          }),
        { samples: [], deletedSamples: [], newAnchor: anchor }
      );
      for (const sample of result.samples) {
        const mapped = mapHealthKitQuantitySample(type, sample);
        if (isHealthLocalDateInLookback(localDateForSample(mapped), localToday)) {
          samples.push(toIngestSample(mapped));
        }
      }
      for (const deleted of result.deletedSamples ?? []) {
        if (deleted.uuid) {
          deletedNativeIds.push(deleted.uuid);
        }
      }
      if (result.newAnchor) {
        nextAnchors[type] = result.newAnchor;
        anchor = result.newAnchor;
      }
      const pageEmpty =
        result.samples.length === 0 && (result.deletedSamples?.length ?? 0) === 0;
      if (pageEmpty || result.samples.length < ANCHOR_PAGE_LIMIT) {
        break;
      }
    }
  }

  return { samples, deletedNativeIds, nextAnchors };
}

export async function enableHealthKitBackgroundDelivery(bridge: HealthKitBridge) {
  for (const type of HEALTHKIT_QUANTITY_TYPES) {
    await withHealthKitAuthorizationGuard(
      () => bridge.enableBackgroundDelivery(type, 1),
      false
    );
  }
}
