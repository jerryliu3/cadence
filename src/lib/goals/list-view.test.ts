import { describe, expect, it } from "vitest";
import {
  buildGoalMonthOptions,
  filterGoalsByEndMonth,
  filterGoalsByEndMonths,
  partitionGoalsByVisibleStart,
  resolveEffectiveEndMonth,
  resolveEffectiveEndMonths,
  sortGoalsByDate,
  type GoalDateSort,
} from "@/lib/goals/list-view";
import type { Goal } from "@/lib/goals/types";

function buildGoal(
  id: string,
  startDate: string,
  endDate: string | null,
  title = id
): Goal {
  return {
    id,
    owner_id: "user-id",
    title,
    description: null,
    category: "general",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: null,
    milestone_names: null,
    start_date: startDate,
    end_date: endDate,
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

const goals = [
  buildGoal("middle", "2026-03-01", "2026-08-15"),
  buildGoal("latest", "2026-04-01", "2026-12-31"),
  buildGoal("earliest", "2026-01-01", "2026-07-01"),
  buildGoal("ongoing", "2026-02-01", null),
];

describe("goal list view helpers", () => {
  it("keeps every goal when no end-month filter is set", () => {
    expect(filterGoalsByEndMonth(goals, null)).toEqual(goals);
  });

  it("keeps only goals ending inside the selected month", () => {
    const endMonthGoals = [
      buildGoal("before", "2026-01-01", "2026-07-01"),
      buildGoal("end-of-month", "2026-01-01", "2026-07-31"),
      buildGoal("after", "2026-01-01", "2026-08-01"),
      buildGoal("ongoing", "2026-01-01", null),
    ];

    expect(filterGoalsByEndMonth(endMonthGoals, "2026-07").map((goal) => goal.id)).toEqual(
      ["before", "end-of-month"]
    );
  });

  it("keeps goals that match any selected end month", () => {
    const endMonthGoals = [
      buildGoal("july", "2026-01-01", "2026-07-01"),
      buildGoal("august", "2026-01-01", "2026-08-01"),
      buildGoal("september", "2026-01-01", "2026-09-01"),
    ];

    expect(filterGoalsByEndMonths(endMonthGoals, ["2026-07", "2026-09"]).map((goal) => goal.id)).toEqual(
      ["july", "september"]
    );
  });

  it.each<{ sort: GoalDateSort; expected: string[] }>([
    {
      sort: "earliest_end",
      expected: ["earliest", "middle", "latest", "ongoing"],
    },
    {
      sort: "latest_end",
      expected: ["latest", "middle", "earliest", "ongoing"],
    },
    {
      sort: "earliest_start",
      expected: ["earliest", "ongoing", "middle", "latest"],
    },
    {
      sort: "latest_start",
      expected: ["latest", "middle", "ongoing", "earliest"],
    },
  ])("sorts goals using $sort", ({ sort, expected }) => {
    expect(sortGoalsByDate(goals, sort).map((goal) => goal.id)).toEqual(expected);
  });

  it("uses title as a deterministic tie-breaker", () => {
    const tiedGoals = [
      buildGoal("z-id", "2026-01-01", "2026-07-31", "Zulu"),
      buildGoal("a-id", "2026-01-01", "2026-07-31", "Alpha"),
    ];

    expect(sortGoalsByDate(tiedGoals, "earliest_end").map((goal) => goal.title)).toEqual([
      "Alpha",
      "Zulu",
    ]);
  });

  it("partitions goals ending before the visible period while retaining ongoing goals", () => {
    const result = partitionGoalsByVisibleStart(goals, "2026-08-01");

    expect(result.current.map((goal) => goal.id)).toEqual(["middle", "latest", "ongoing"]);
    expect(result.historical.map((goal) => goal.id)).toEqual(["earliest"]);
  });

  it("builds month options starting at the selected view month", () => {
    const options = buildGoalMonthOptions(
      [
        buildGoal("first", "2026-01-01", "2026-07-15"),
        buildGoal("last", "2026-01-01", "2026-09-01"),
      ],
      "2026-08"
    );

    expect(options).toEqual([
      { label: "August 2026", value: "2026-08" },
      { label: "September 2026", value: "2026-09" },
    ]);
  });

  it("keeps only end-month filters inside or after the visible window", () => {
    expect(resolveEffectiveEndMonth("2026-09", "2026-08")).toBe("2026-09");
    expect(resolveEffectiveEndMonth("2026-08", "2026-08")).toBe("2026-08");
    expect(resolveEffectiveEndMonth("2026-07", "2026-08")).toBeNull();
    expect(resolveEffectiveEndMonth(null, "2026-08")).toBeNull();
  });

  it("keeps only effective end-month selections for multi-select filters", () => {
    expect(
      resolveEffectiveEndMonths(
        ["2026-09", "2026-07", "2026-09", "invalid", "2026-08"],
        "2026-08"
      )
    ).toEqual(["2026-09", "2026-08"]);
  });
});
