import { describe, expect, it } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import {
  getAdmissibleCompletions,
  getCreditedUnitCount,
  getExpectedCadencePeriodCount,
} from "./admissible";

function buildGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-id",
    owner_id: "owner-id",
    title: "Goal",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: null,
    milestone_names: null,
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function completion(date: string, index = 0): Completion {
  return {
    id: `${date}-${index}`,
    goal_id: "goal-id",
    user_id: "owner-id",
    completed_on: date,
    source: "manual",
    created_at: `${date}T12:00:00Z`,
  };
}

describe("completion admissibility", () => {
  it("excludes facts before lifetime, after deadline, and after as-of date", () => {
    const goal = buildGoal();
    const facts = [
      completion("2026-07-31"),
      completion("2026-08-01"),
      completion("2026-08-16"),
      completion("2026-09-01"),
    ];

    expect(
      getAdmissibleCompletions(goal, facts, { asOfDate: "2026-08-15" }).map(
        (fact) => fact.completed_on
      )
    ).toEqual(["2026-08-01"]);
  });

  it("credits cadence at most once per anchored period", () => {
    const goal = buildGoal();
    const facts = [
      completion("2026-08-01"),
      completion("2026-08-02"),
      completion("2026-08-08"),
    ];

    expect(
      getCreditedUnitCount(goal, facts, { asOfDate: "2026-08-15" })
    ).toBe(2);
  });

  it("uses weekly cutover anchor for expected cadence period denominator", () => {
    const goal = buildGoal({
      start_date: "2026-08-06",
    });

    expect(
      getExpectedCadencePeriodCount(goal, {
        asOfDate: "2026-08-18",
      })
    ).toBe(2);
    expect(
      getExpectedCadencePeriodCount(goal, {
        asOfDate: "2026-08-18",
        weeklyAnchor: {
          weekStartsOn: 1,
          effectiveFrom: "2026-08-17",
        },
      })
    ).toBe(3);
  });

  it("dedupes cadence credits against cutover-adjusted weekly period keys", () => {
    const goal = buildGoal({
      start_date: "2026-08-06",
    });
    const facts = [completion("2026-08-16"), completion("2026-08-18")];

    expect(
      getCreditedUnitCount(goal, facts, {
        asOfDate: "2026-08-20",
      })
    ).toBe(1);
    expect(
      getCreditedUnitCount(goal, facts, {
        asOfDate: "2026-08-20",
        weeklyAnchor: {
          weekStartsOn: 1,
          effectiveFrom: "2026-08-17",
        },
      })
    ).toBe(2);
  });

  it("credits targeted totals by exact admissible dates", () => {
    const goal = buildGoal({ target_count: 2 });
    const facts = [
      completion("2026-08-01"),
      completion("2026-08-02"),
      completion("2026-09-01"),
    ];

    expect(
      getCreditedUnitCount(goal, facts, { asOfDate: "2026-09-05" })
    ).toBe(2);
  });
});
