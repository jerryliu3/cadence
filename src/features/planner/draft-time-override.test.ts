import { describe, expect, it } from "vitest";
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";
import { planDraftTimeOverrideUpdate } from "@/features/planner/draft-time-override";

function buildEntry(
  overrides: Partial<PlannerDayDetailEntry> = {}
): PlannerDayDetailEntry {
  return {
    key: "goal-a:total:1",
    originalGoalId: "goal-a",
    goalTitle: "Goal A",
    unitKey: "total:1",
    label: null,
    classification: "open",
    creditState: "uncredited",
    activeGoal: null,
    activeItem: null,
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
    ...overrides,
  };
}

describe("planDraftTimeOverrideUpdate", () => {
  it("blocks draft retiming for credited sessions", () => {
    const plan = planDraftTimeOverrideUpdate({
      entry: buildEntry({ creditState: "completed_as_scheduled" }),
      localTimeInput: "09:30",
      baselineOverride: null,
    });
    expect(plan).toEqual({
      status: "blocked",
      reason: "immovable",
    });
  });

  it("blocks draft retiming for historical sessions", () => {
    const plan = planDraftTimeOverrideUpdate({
      entry: buildEntry({ classification: "historical_shortfall" }),
      localTimeInput: "09:30",
      baselineOverride: null,
    });
    expect(plan).toEqual({
      status: "blocked",
      reason: "immovable",
    });
  });

  it("rejects malformed local time input without mutating commands", () => {
    const plan = planDraftTimeOverrideUpdate({
      entry: buildEntry(),
      localTimeInput: "2:30 PM",
      baselineOverride: null,
    });
    expect(plan).toEqual({
      status: "blocked",
      reason: "invalid_time",
    });
  });

  it("clears stale set/clear commands when baseline has no override", () => {
    const plan = planDraftTimeOverrideUpdate({
      entry: buildEntry(),
      localTimeInput: "",
      baselineOverride: null,
    });
    expect(plan).toEqual({
      status: "dispatch",
      actions: [
        {
          type: "remove_kind",
          kind: "set_item_time_override",
          goalId: "goal-a",
          unitKey: "total:1",
        },
        {
          type: "remove_kind",
          kind: "clear_item_time_override",
          goalId: "goal-a",
          unitKey: "total:1",
        },
      ],
    });
  });

  it("creates a clear override command when baseline has one", () => {
    const plan = planDraftTimeOverrideUpdate({
      entry: buildEntry(),
      localTimeInput: "",
      baselineOverride: "08:00",
    });
    expect(plan).toEqual({
      status: "dispatch",
      actions: [
        {
          type: "clear_time_override",
          goalId: "goal-a",
          unitKey: "total:1",
        },
      ],
    });
  });

  it("creates set override command when time differs from baseline", () => {
    const plan = planDraftTimeOverrideUpdate({
      entry: buildEntry(),
      localTimeInput: "09:15",
      baselineOverride: "08:00",
    });
    expect(plan).toEqual({
      status: "dispatch",
      actions: [
        {
          type: "upsert_time_override",
          goalId: "goal-a",
          unitKey: "total:1",
          localTime: "09:15",
        },
      ],
    });
  });
});
