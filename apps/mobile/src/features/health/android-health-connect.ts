import type { HealthMetricKey } from "@cadence/shared/health/providers";
import { healthLocalDateFromOffset } from "@cadence/shared/health/local-date";
import {
  healthNativeQueryRange,
  isHealthLocalDateInLookback,
} from "@cadence/shared/health/sync-window";
import { resolveHealthConnectSourceIdentifier } from "./health-connect-source";
import {
  localDateForSample,
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

export interface HealthConnectReadResult {
  records: HealthConnectRecordLike[];
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
  readRecords: (
    recordType: string,
    options: {
      timeRangeFilter: {
        operator: "between";
        startTime: string;
        endTime: string;
      };
    }
  ) => Promise<HealthConnectReadResult>;
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

function isRecordType(
  value: string | undefined
): value is HealthConnectRecordType {
  return (
    value !== undefined &&
    (HEALTH_CONNECT_RECORD_TYPES as readonly string[]).includes(value)
  );
}

async function readLookbackRecords(
  bridge: HealthConnectBridge,
  now: Date
): Promise<{
  samples: ReturnType<typeof toIngestSample>[];
  currentDeviceSpn: string | null;
}> {
  const currentDeviceSpn = bridge.getCurrentDeviceSpn
    ? await bridge.getCurrentDeviceSpn()
    : null;
  const range = healthNativeQueryRange(now);
  const localToday = healthLocalDateFromOffset(
    now,
    utcOffsetMinutesFromInstant(now)
  );
  const samples: ReturnType<typeof toIngestSample>[] = [];

  for (const recordType of HEALTH_CONNECT_RECORD_TYPES) {
    const result = await bridge.readRecords(recordType, {
      timeRangeFilter: {
        operator: "between",
        startTime: range.start.toISOString(),
        endTime: range.end.toISOString(),
      },
    });
    for (const record of result.records) {
      const mapped = mapHealthConnectRecord(
        recordType,
        record,
        currentDeviceSpn
      );
      if (isHealthLocalDateInLookback(localDateForSample(mapped), localToday)) {
        samples.push(toIngestSample(mapped));
      }
    }
  }

  return { samples, currentDeviceSpn };
}

async function mintChangesToken(
  bridge: HealthConnectBridge
): Promise<{ token: string; deletionChanges: Array<{ recordId: string }> }> {
  const result = await bridge.getChanges({
    recordTypes: [...HEALTH_CONNECT_RECORD_TYPES],
    changesToken: undefined,
  });
  return {
    token: result.nextChangesToken,
    deletionChanges: result.deletionChanges,
  };
}

export async function collectHealthConnectSamples(
  bridge: HealthConnectBridge,
  changesToken: string | undefined,
  now = new Date()
): Promise<{
  samples: ReturnType<typeof toIngestSample>[];
  deletedNativeIds: string[];
  nextChangesToken: string;
}> {
  await bridge.initialize();
  await bridge.requestPermission(
    HEALTH_CONNECT_RECORD_TYPES.map((recordType) => ({
      accessType: "read" as const,
      recordType,
    }))
  );

  if (!changesToken) {
    const lookback = await readLookbackRecords(bridge, now);
    const minted = await mintChangesToken(bridge);
    return {
      samples: lookback.samples,
      deletedNativeIds: minted.deletionChanges.map((change) => change.recordId),
      nextChangesToken: minted.token,
    };
  }

  const currentDeviceSpn = bridge.getCurrentDeviceSpn
    ? await bridge.getCurrentDeviceSpn()
    : null;
  const samples: ReturnType<typeof toIngestSample>[] = [];
  const deletedNativeIds: string[] = [];
  const localToday = healthLocalDateFromOffset(
    now,
    utcOffsetMinutesFromInstant(now)
  );
  let token: string | undefined = changesToken;
  let nextChangesToken = changesToken;
  let hasMore = true;

  while (hasMore) {
    const result = await bridge.getChanges({
      recordTypes: [...HEALTH_CONNECT_RECORD_TYPES],
      changesToken: token,
    });
    if (result.changesTokenExpired) {
      const lookback = await readLookbackRecords(bridge, now);
      const minted = await mintChangesToken(bridge);
      return {
        samples: lookback.samples,
        deletedNativeIds: [
          ...deletedNativeIds,
          ...result.deletionChanges.map((change) => change.recordId),
          ...minted.deletionChanges.map((change) => change.recordId),
        ],
        nextChangesToken: minted.token,
      };
    }
    for (const change of result.upsertionChanges) {
      const recordType = (change.recordType ??
        inferRecordType(change.record)) as HealthConnectRecordType | undefined;
      if (!isRecordType(recordType)) {
        continue;
      }
      const mapped = mapHealthConnectRecord(
        recordType,
        change.record,
        currentDeviceSpn
      );
      if (isHealthLocalDateInLookback(localDateForSample(mapped), localToday)) {
        samples.push(toIngestSample(mapped));
      }
    }
    for (const change of result.deletionChanges) {
      deletedNativeIds.push(change.recordId);
    }
    nextChangesToken = result.nextChangesToken;
    token = result.nextChangesToken;
    hasMore = Boolean(result.hasMore);
  }

  return { samples, deletedNativeIds, nextChangesToken };
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
