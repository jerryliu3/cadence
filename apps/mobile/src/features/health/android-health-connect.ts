import type { HealthMetricKey } from "@cadence/shared/health/providers";
import { resolveHealthConnectSourceIdentifier } from "./health-connect-source";
import {
  toIngestSample,
  utcOffsetMinutesFromInstant,
  type NormalizedHealthSample,
} from "./ingest-payload";

export const HEALTH_CONNECT_RECORD_TYPES = [
  "Steps",
  "ActiveCaloriesBurned",
  "Distance",
  "ExerciseSession",
  "SleepSession",
] as const;

export type HealthConnectRecordType = (typeof HEALTH_CONNECT_RECORD_TYPES)[number];

export interface HealthConnectRecordLike {
  startTime: string;
  endTime?: string;
  count?: number;
  energy?: { inKilocalories?: number };
  distance?: { inMeters?: number };
  metadata?: {
    id?: string;
    dataOrigin?: string | { packageName?: string };
  };
}

export interface HealthConnectChangeResult {
  upsertionChanges: Array<{ record: HealthConnectRecordLike; recordType?: string }>;
  deletionChanges: Array<{ recordId: string }>;
  nextChangesToken: string;
  changesTokenExpired?: boolean;
  hasMore?: boolean;
}

export interface HealthConnectBridge {
  initialize: () => Promise<boolean>;
  requestPermission: (
    permissions: Array<{ accessType: "read"; recordType: string }>
  ) => Promise<unknown>;
  getChanges: (input: {
    recordTypes: string[];
    changesToken?: string;
  }) => Promise<HealthConnectChangeResult>;
  getCurrentDeviceSpn?: () => Promise<string | null>;
}

const METRIC_BY_RECORD: Record<
  HealthConnectRecordType,
  { metricKey: HealthMetricKey; unit: string; readValue: (record: HealthConnectRecordLike) => number }
> = {
  Steps: {
    metricKey: "steps",
    unit: "count",
    readValue: (record) => record.count ?? 0,
  },
  ActiveCaloriesBurned: {
    metricKey: "active_energy_kcal",
    unit: "kcal",
    readValue: (record) => record.energy?.inKilocalories ?? 0,
  },
  Distance: {
    metricKey: "distance_meters",
    unit: "m",
    readValue: (record) => record.distance?.inMeters ?? 0,
  },
  ExerciseSession: {
    metricKey: "exercise_minutes",
    unit: "min",
    readValue: (record) => {
      const start = Date.parse(record.startTime);
      const end = Date.parse(record.endTime ?? record.startTime);
      return Math.max(0, Math.round((end - start) / 60_000));
    },
  },
  SleepSession: {
    metricKey: "sleep_asleep_minutes",
    unit: "min",
    readValue: (record) => {
      const start = Date.parse(record.startTime);
      const end = Date.parse(record.endTime ?? record.startTime);
      return Math.max(0, Math.round((end - start) / 60_000));
    },
  },
};

export function mapHealthConnectRecord(
  recordType: HealthConnectRecordType,
  record: HealthConnectRecordLike,
  currentDeviceSpn: string | null
): NormalizedHealthSample {
  const startedAt = new Date(record.startTime);
  const mapping = METRIC_BY_RECORD[recordType];
  return {
    providerNativeId: record.metadata?.id ?? `${recordType}:${record.startTime}`,
    sourceIdentifier: resolveHealthConnectSourceIdentifier({
      dataOrigin: record.metadata?.dataOrigin,
      currentDeviceSpn,
    }),
    metricKey: mapping.metricKey,
    startedAt: startedAt.toISOString(),
    endedAt: record.endTime,
    utcOffsetMinutes: utcOffsetMinutesFromInstant(startedAt),
    valueNumeric: mapping.readValue(record),
    unit: mapping.unit,
  };
}

export async function collectHealthConnectSamples(
  bridge: HealthConnectBridge,
  changesToken: string | undefined
): Promise<{
  samples: ReturnType<typeof toIngestSample>[];
  nextChangesToken: string;
}> {
  await bridge.initialize();
  await bridge.requestPermission(
    HEALTH_CONNECT_RECORD_TYPES.map((recordType) => ({
      accessType: "read" as const,
      recordType,
    }))
  );

  const currentDeviceSpn = bridge.getCurrentDeviceSpn
    ? await bridge.getCurrentDeviceSpn()
    : null;
  const samples: ReturnType<typeof toIngestSample>[] = [];
  let token = changesToken;
  let nextChangesToken = changesToken ?? "";
  let hasMore = true;
  let retriedExpiredToken = false;

  while (hasMore) {
    const result = await bridge.getChanges({
      recordTypes: [...HEALTH_CONNECT_RECORD_TYPES],
      changesToken: token,
    });
    if (result.changesTokenExpired && !retriedExpiredToken) {
      retriedExpiredToken = true;
      token = undefined;
      continue;
    }
    for (const change of result.upsertionChanges) {
      const recordType = (change.recordType ?? inferRecordType(change.record)) as
        | HealthConnectRecordType
        | undefined;
      if (!recordType || !(recordType in METRIC_BY_RECORD)) {
        continue;
      }
      samples.push(
        toIngestSample(
          mapHealthConnectRecord(recordType, change.record, currentDeviceSpn)
        )
      );
    }
    nextChangesToken = result.nextChangesToken;
    token = result.nextChangesToken;
    hasMore = Boolean(result.hasMore);
  }

  return { samples, nextChangesToken };
}

function inferRecordType(
  record: HealthConnectRecordLike
): HealthConnectRecordType | undefined {
  if (typeof record.count === "number") {
    return "Steps";
  }
  if (record.energy?.inKilocalories != null) {
    return "ActiveCaloriesBurned";
  }
  if (record.distance?.inMeters != null) {
    return "Distance";
  }
  return undefined;
}
