import { describe, expect, it } from "vitest";
import {
  buildPartnerCompletionMarkersByDate,
  mergeCompletionFactMarkers,
  monthGridFactsBounds,
} from "@cadence/shared/planner/partner-completion";

describe("calendar partner overlay", () => {
  it("builds month-bounded partner markers without mixing into viewer identity keys", () => {
    // 6 days before the 1st through 41 days after covers the widest 42-cell
    // grid any weekStartsOn can produce, so leading/trailing cells are included.
    expect(monthGridFactsBounds("2026-08")).toEqual({
      factsFrom: "2026-07-26",
      factsTo: "2026-09-11",
    });
    expect(monthGridFactsBounds("nope")).toBeNull();
    const markers = buildPartnerCompletionMarkersByDate({
      facts: [
        { goal_id: "g1", completed_on: "2026-08-13", source: "manual" },
        { goal_id: "g2", completed_on: "2026-08-13", source: "manual" },
      ],
      titles: { g1: "Run" },
    });
    const dayMarkers = markers.get("2026-08-13") ?? [];
    expect(dayMarkers.map((marker) => marker.goalTitle)).toEqual(["Completed", "Run"]);
    expect(dayMarkers.every((marker) => marker.owner === "partner")).toBe(true);
    expect(dayMarkers.every((marker) => marker.key.startsWith("partner:"))).toBe(true);
  });

  it("merges partner markers after viewer markers", () => {
    const merged = mergeCompletionFactMarkers(
      [
        {
          key: "viewer-1",
          originalGoalId: "v1",
          unitKey: "cadence:0",
          goalTitle: "Mine",
          scheduledDate: "2026-08-12",
          owner: "viewer",
        },
      ],
      [
        {
          key: "partner:g1:2026-08-13:manual",
          originalGoalId: "g1",
          unitKey: "partner-fact",
          goalTitle: "Run",
          scheduledDate: "2026-08-13",
          owner: "partner",
        },
      ]
    );
    expect(merged.map((marker) => marker.owner)).toEqual(["viewer", "partner"]);
  });
});
