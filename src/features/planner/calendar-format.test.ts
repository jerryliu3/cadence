import { describe, expect, it } from "vitest";
import {
  buildWeekdayLabels,
  getEntryCompactTitle,
  getEntryFeedTitle,
  getEntrySubtitle,
  normalizeWeekStartsOn,
} from "@/features/planner/calendar-format";

describe("calendar format week start helpers", () => {
  it("defaults invalid week start values to Monday", () => {
    expect(normalizeWeekStartsOn(undefined)).toBe(1);
    expect(normalizeWeekStartsOn(null)).toBe(1);
    expect(normalizeWeekStartsOn(-1)).toBe(1);
    expect(normalizeWeekStartsOn(9)).toBe(1);
  });

  it("builds weekday headers from a configured start day", () => {
    expect(buildWeekdayLabels(1)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(buildWeekdayLabels(0)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });
});

describe("calendar entry subtitles", () => {
  it("omits subtitles for recurring completion units", () => {
    expect(
      getEntrySubtitle({
        goalTitle: "Run",
        label: "total:2",
      })
    ).toBeNull();
  });

  it("keeps the next named milestone subtitle", () => {
    expect(
      getEntrySubtitle({
        goalTitle: "Launch",
        label: "Publish beta",
      })
    ).toBe("Next: Publish beta");
  });

  it("keeps default milestone text when the subtitle shows both names", () => {
    expect(
      getEntrySubtitle({
        goalTitle: "Launch",
        label: "Milestone 2",
      })
    ).toBe("Next: Milestone 2");
  });
});

describe("calendar compact entry titles", () => {
  it("prefers meaningful labels over goal title in compact contexts", () => {
    expect(
      getEntryCompactTitle({
        goalTitle: "5k training block",
        label: "Tempo run 4x800",
        unitKey: "milestone:2",
      })
    ).toBe("Tempo run 4x800");
  });

  it("uses the goal title for canonical default milestone labels", () => {
    expect(
      getEntryCompactTitle({
        goalTitle: "5k training block",
        label: "Milestone 2",
        unitKey: "milestone:2",
      })
    ).toBe("5k training block");
  });

  it("uses the goal title when the milestone label is absent", () => {
    expect(
      getEntryCompactTitle({
        goalTitle: "5k training block",
        label: null,
        unitKey: "milestone:2",
      })
    ).toBe("5k training block");
  });

  it("keeps a default-looking label assigned to a different ordinal", () => {
    expect(
      getEntryCompactTitle({
        goalTitle: "5k training block",
        label: "Milestone 3",
        unitKey: "milestone:2",
      })
    ).toBe("Milestone 3");
  });

  it("keeps the default label when no goal title is available", () => {
    expect(
      getEntryCompactTitle({
        goalTitle: null,
        label: "Milestone 2",
        unitKey: "milestone:2",
      })
    ).toBe("Milestone 2");
  });

  it("falls back to canonical title for derived counter labels", () => {
    expect(
      getEntryCompactTitle({
        goalTitle: "Read",
        label: "total:3",
        unitKey: "total:3",
      })
    ).toBe("Read");
  });
});

describe("calendar feed entry titles", () => {
  it("uses a milestone label in feed items when available", () => {
    expect(
      getEntryFeedTitle({
        goalTitle: "5k training block",
        label: "Tempo run 4x800",
        unitKey: "milestone:2",
      })
    ).toBe("Tempo run 4x800");
  });

  it("falls back to goal title for milestone entries with blank labels", () => {
    expect(
      getEntryFeedTitle({
        goalTitle: "5k training block",
        label: "   ",
        unitKey: "milestone:2",
      })
    ).toBe("5k training block");
  });

  it("keeps non-milestone feed titles on goal title", () => {
    expect(
      getEntryFeedTitle({
        goalTitle: "Hydration",
        label: "Drink two liters",
        unitKey: "total:1",
      })
    ).toBe("Hydration");
  });
});
