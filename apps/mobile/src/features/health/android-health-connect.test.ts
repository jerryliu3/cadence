import { describe, expect, it, vi } from "vitest";
import {
  collectHealthConnectSamples,
  mapHealthConnectRecord,
  type HealthConnectBridge,
} from "./android-health-connect";

describe("Android Health Connect bridge", () => {
  it("maps SPN data origins onto ingest source identifiers", () => {
    const spn = "com.android.healthconnect.phone.abc";
    const mapped = mapHealthConnectRecord(
      "Steps",
      {
        startTime: "2026-08-14T04:00:00.000Z",
        count: 80,
        metadata: {
          id: "rec-1",
          dataOrigin: { packageName: spn },
        },
      },
      spn
    );
    expect(mapped.sourceIdentifier).toBe(spn);
    expect(mapped.metricKey).toBe("steps");
  });

  it("backfills with readRecords on first sync instead of tokenless getChanges history", async () => {
    const now = new Date("2026-08-14T16:00:00.000Z");
    const readRecords = vi.fn(async (recordType: string) => ({
      records:
        recordType === "Steps"
          ? [
              {
                startTime: "2026-08-14T04:00:00.000Z",
                count: 10,
                metadata: { id: "s1", dataOrigin: "com.sec.android.app.shealth" },
              },
            ]
          : [],
    }));
    const getChanges = vi.fn(async () => ({
      upsertionChanges: [],
      deletionChanges: [],
      nextChangesToken: "minted",
      hasMore: false,
    }));
    const bridge: HealthConnectBridge = {
      initialize: vi.fn(async () => true),
      requestPermission: vi.fn(async () => []),
      getChanges,
      readRecords,
      getCurrentDeviceSpn: vi.fn(async () => "com.android.healthconnect.phone.abc"),
    };

    const result = await collectHealthConnectSamples(bridge, undefined, now);
    expect(readRecords).toHaveBeenCalled();
    expect(getChanges).toHaveBeenCalledWith(
      expect.objectContaining({ changesToken: undefined })
    );
    expect(result.nextChangesToken).toBe("minted");
    expect(result.samples[0]?.sourceIdentifier).toBe("com.sec.android.app.shealth");
  });

  it("backfills with readRecords when a changes token is expired", async () => {
    const now = new Date("2026-08-14T16:00:00.000Z");
    const readRecords = vi.fn(async () => ({ records: [] }));
    const getChanges = vi
      .fn()
      .mockResolvedValueOnce({
        upsertionChanges: [],
        deletionChanges: [{ recordId: "gone" }],
        nextChangesToken: "stale",
        changesTokenExpired: true,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        upsertionChanges: [],
        deletionChanges: [],
        nextChangesToken: "fresh",
        hasMore: false,
      });

    const bridge: HealthConnectBridge = {
      initialize: vi.fn(async () => true),
      requestPermission: vi.fn(async () => []),
      getChanges,
      readRecords,
      getCurrentDeviceSpn: vi.fn(async () => null),
    };

    const result = await collectHealthConnectSamples(bridge, "expired-token", now);
    expect(readRecords).toHaveBeenCalled();
    expect(result.nextChangesToken).toBe("fresh");
    expect(result.deletedNativeIds).toContain("gone");
  });
});
