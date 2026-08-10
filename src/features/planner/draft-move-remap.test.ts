import { describe, expect, it } from "vitest";
import {
  buildDraftMoveCommands,
  remapGoalDatesForDraftMove,
} from "@/features/planner/draft-move-remap";

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

describe("buildDraftMoveCommands keeps earlier drags pinned", () => {
  // Regression: dragging the last milestone later, then the second-to-last to
  // two days before it, used to drop the first drag's pin -- its remapped date
  // matched the preview, which only showed that date because of the pin. The
  // solver then slid it back to one day after the newly pinned neighbour.
  it("pins every unit in the mapping, including unchanged dates", () => {
    const commands = buildDraftMoveCommands({
      units: [
        { unitKey: "milestone:1", ordinal: 1, scheduledDate: "2026-08-01" },
        { unitKey: "milestone:2", ordinal: 2, scheduledDate: "2026-08-02" },
        { unitKey: "milestone:3", ordinal: 3, scheduledDate: "2026-08-25" },
      ],
      movedUnitKey: "milestone:2",
      nextDate: "2026-08-23",
      kind: "deadline_total",
    });

    expect(commands).toEqual([
      { unitKey: "milestone:1", scheduledDate: "2026-08-01" },
      { unitKey: "milestone:2", scheduledDate: "2026-08-23" },
      // Still pinned, so the earlier drag to Aug 25 survives.
      { unitKey: "milestone:3", scheduledDate: "2026-08-25" },
    ]);
  });

  it("pins only the dragged milestone for an ordered sequence", () => {
    expect(
      buildDraftMoveCommands({
        units: [
          { unitKey: "milestone:1", ordinal: 1, scheduledDate: "2026-08-01" },
          { unitKey: "milestone:2", ordinal: 2, scheduledDate: "2026-08-02" },
        ],
        movedUnitKey: "milestone:1",
        nextDate: "2026-08-25",
        kind: "milestone_sequence",
      })
    ).toEqual([{ unitKey: "milestone:1", scheduledDate: "2026-08-25" }]);
  });
});
