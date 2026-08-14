import { describe, expect, it } from "vitest";
import {
  toHealthAutocompleteRuleStatuses,
  toHealthProviderStatuses,
} from "./status-payload";

describe("health status payload", () => {
  it("maps evidence states without raw health metric values", () => {
    const payload = {
      schemaVersion: "1" as const,
      providers: toHealthProviderStatuses(
        [
          {
            provider: "apple_healthkit",
            permission_prompted_at: "2026-08-14T12:00:00.000Z",
            last_ingest_at: "2026-08-14T17:00:00.000Z",
            last_sample_at: "2026-08-14T17:00:00.000Z",
            last_error: "Health Connect token expired",
          },
        ],
        Date.parse("2026-08-14T18:00:00.000Z")
      ),
      autocompleteRules: toHealthAutocompleteRuleStatuses([
        {
          id: "rule-1",
          goal_id: "goal-1",
          metric_key: "steps",
          threshold_numeric: 8000,
          enabled: true,
        },
      ]),
    };

    expect(payload.providers[0]).toEqual({
      provider: "apple_healthkit",
      state: "receiving_data",
      lastIngestAt: "2026-08-14T17:00:00.000Z",
      lastSampleAt: "2026-08-14T17:00:00.000Z",
      lastError: "Health Connect token expired",
    });
    expect(JSON.stringify(payload)).not.toMatch(/value_numeric|kcal|heart/i);
    expect(Object.keys(payload.providers[0]).sort()).toEqual([
      "lastError",
      "lastIngestAt",
      "lastSampleAt",
      "provider",
      "state",
    ]);
  });
});
