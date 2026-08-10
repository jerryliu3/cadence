import { describe, expect, it } from "vitest";
import { remapGoalDatesForDraftMove } from "@/features/planner/draft-move-remap";

const units = [
  { unitKey: "total:1", ordinal: 1, scheduledDate: "2026-08-01" },
  { unitKey: "total:2", ordinal: 2, scheduledDate: "2026-08-02" },
  { unitKey: "total:3", ordinal: 3, scheduledDate: "2026-08-03" },
  { unitKey: "total:4", ordinal: 4, scheduledDate: "2026-08-04" },
];

describe("remapGoalDatesForDraftMove", () => {
  it("changes exactly one occupied date when moving forward", () => {
    const pinned = remapGoalDatesForDraftMove({
      units,
      movedUnitKey: "total:2",
      nextDate: "2026-08-19",
    });

    expect(Object.values(pinned).sort()).toEqual([
      "2026-08-01",
      "2026-08-03",
      "2026-08-04",
      "2026-08-19",
    ]);
    // Ordinals relabel; the last one takes the new date.
    expect(pinned).toEqual({
      "total:1": "2026-08-01",
      "total:2": "2026-08-03",
      "total:3": "2026-08-04",
      "total:4": "2026-08-19",
    });
  });

  it("changes exactly one occupied date when moving backward", () => {
    const pinned = remapGoalDatesForDraftMove({
      units,
      movedUnitKey: "total:4",
      nextDate: "2026-07-30",
    });

    expect(Object.values(pinned).sort()).toEqual([
      "2026-07-30",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("keeps the mapping unchanged when the date does not cross a neighbour", () => {
    const pinned = remapGoalDatesForDraftMove({
      units,
      movedUnitKey: "total:2",
      nextDate: "2026-08-02",
    });

    expect(pinned).toEqual({
      "total:1": "2026-08-01",
      "total:2": "2026-08-02",
      "total:3": "2026-08-03",
      "total:4": "2026-08-04",
    });
  });

  it("falls back to a single pin when the unit is not in the set", () => {
    expect(
      remapGoalDatesForDraftMove({
        units,
        movedUnitKey: "total:9",
        nextDate: "2026-08-19",
      })
    ).toEqual({ "total:9": "2026-08-19" });
  });
});

describe("milestone sequences keep ordinal identity", () => {
  const milestones = [
    { unitKey: "milestone:1", ordinal: 1, scheduledDate: "2026-08-01" },
    { unitKey: "milestone:2", ordinal: 2, scheduledDate: "2026-08-02" },
    { unitKey: "milestone:3", ordinal: 3, scheduledDate: "2026-08-03" },
  ];

  it("pins only the dragged milestone so its label travels with it", () => {
    expect(
      remapGoalDatesForDraftMove({
        units: milestones,
        movedUnitKey: "milestone:1",
        nextDate: "2026-08-25",
        kind: "milestone_sequence",
      })
    ).toEqual({ "milestone:1": "2026-08-25" });
  });

  it("still remaps interchangeable sessions", () => {
    expect(
      remapGoalDatesForDraftMove({
        units: milestones,
        movedUnitKey: "milestone:1",
        nextDate: "2026-08-25",
        kind: "deadline_total",
      })
    ).toEqual({
      "milestone:1": "2026-08-02",
      "milestone:2": "2026-08-03",
      "milestone:3": "2026-08-25",
    });
  });
});
