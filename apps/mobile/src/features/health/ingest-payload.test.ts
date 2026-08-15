import { describe, expect, it } from "vitest";
import {
  localDateForSample,
  toIngestSample,
  utcOffsetMinutesFromInstant,
} from "./ingest-payload";

describe("health ingest payload", () => {
  it("maps a sample without using a profile timezone", () => {
    const startedAt = new Date("2026-08-14T04:00:00.000Z");
    const utcOffsetMinutes = -240;
    const sample = toIngestSample({
      providerNativeId: "hk-1",
      sourceIdentifier: "com.apple.health",
      sourceName: "Apple Watch",
      metricKey: "steps",
      startedAt: startedAt.toISOString(),
      utcOffsetMinutes,
      valueNumeric: 1200,
      unit: "count",
    });

    expect(sample.utcOffsetMinutes).toBe(-240);
    expect(localDateForSample(sample)).toBe("2026-08-14");
    expect(utcOffsetMinutesFromInstant(startedAt)).toEqual(expect.any(Number));
  });
});
