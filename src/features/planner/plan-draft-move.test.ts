import { describe, expect, it } from "vitest";
import { planDraftMove } from "@/features/planner/plan-draft-move";
import {
  buildPlannerDayEntry,
  buildPlannerWorkUnit,
} from "@/features/planner/test-fixtures";

const validMove = {
  nextDate: "2026-08-02",
  scopeMonth: "2026-08",
  conflictKeys: undefined,
  completionFactConflict: undefined,
};

describe("planDraftMove", () => {
  it("rejects moves for an active item locked by the planner", () => {
    const result = planDraftMove({
      ...validMove,
      entry: buildPlannerDayEntry({
        activeItem: {
          credited_completion_id: null,
          locked: true,
        },
      }),
      previewUnit: buildPlannerWorkUnit({
        placementWindow: {
          start: "2026-08-01",
          end: "2026-08-31",
        },
      }),
    });

    expect(result).toEqual({
      ok: false,
      message: "Unlock this session before moving it.",
    });
  });

  it("rejects moves for a locked planner work unit", () => {
    const result = planDraftMove({
      ...validMove,
      entry: buildPlannerDayEntry(),
      previewUnit: buildPlannerWorkUnit({
        locked: true,
        placementWindow: {
          start: "2026-08-01",
          end: "2026-08-31",
        },
      }),
    });

    expect(result).toEqual({
      ok: false,
      message: "Unlock this session before moving it.",
    });
  });
});
