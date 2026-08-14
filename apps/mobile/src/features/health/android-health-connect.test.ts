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

  it("pages getChanges until hasMore is false and refreshes expired tokens", async () => {
    const getChanges = vi
      .fn()
      .mockResolvedValueOnce({
        upsertionChanges: [],
        deletionChanges: [],
        nextChangesToken: "stale",
        changesTokenExpired: true,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        upsertionChanges: [
          {
            recordType: "Steps",
            record: {
              startTime: "2026-08-14T04:00:00.000Z",
              count: 10,
              metadata: { id: "s1", dataOrigin: "com.sec.android.app.shealth" },
            },
          },
        ],
        deletionChanges: [],
        nextChangesToken: "next",
        hasMore: false,
      });

    const bridge: HealthConnectBridge = {
      initialize: vi.fn(async () => true),
      requestPermission: vi.fn(async () => []),
      getChanges,
      getCurrentDeviceSpn: vi.fn(async () => "com.android.healthconnect.phone.abc"),
    };

    const result = await collectHealthConnectSamples(bridge, "expired-token");
    expect(getChanges).toHaveBeenCalledTimes(2);
    expect(result.nextChangesToken).toBe("next");
    expect(result.samples[0]?.sourceIdentifier).toBe("com.sec.android.app.shealth");
  });
});
