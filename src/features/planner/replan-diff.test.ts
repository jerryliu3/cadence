import { describe, expect, it } from "vitest";
import { buildReplanMoves } from "@/features/planner/replan-diff";

const GOAL = "10000000-0000-4000-8000-000000000001";
const unit = (unitKey: string, scheduledDate: string | null) => ({
  originalGoalId: GOAL,
  unitKey,
  scheduledDate,
});

describe("buildReplanMoves", () => {
  it("pins only the units the replan actually moved", () => {
    expect(
      buildReplanMoves({
        baselineWorkUnits: [
          unit("total:1", "2026-08-01"),
          unit("total:2", "2026-08-08"),
          unit("total:3", "2026-08-15"),
        ],
        proposalWorkUnits: [
          unit("total:1", "2026-08-01"),
          unit("total:2", "2026-08-10"),
          unit("total:3", "2026-08-15"),
        ],
      })
    ).toEqual([
      {
        entryKey: `${GOAL}:total:2`,
        goalId: GOAL,
        unitKey: "total:2",
        scheduledDate: "2026-08-10",
      },
    ]);
  });

  it("writes nothing when the replan changes no dates", () => {
    const units = [unit("total:1", "2026-08-01"), unit("total:2", "2026-08-08")];

    expect(
      buildReplanMoves({ baselineWorkUnits: units, proposalWorkUnits: units })
    ).toEqual([]);
  });

  it("skips a unit the replan could not place", () => {
    // A null date carries no pin, so writing one would claim an edit that does
    // nothing and leave the unit free on the next solve.
    expect(
      buildReplanMoves({
        baselineWorkUnits: [unit("total:1", "2026-08-01")],
        proposalWorkUnits: [unit("total:1", null)],
      })
    ).toEqual([]);
  });

  it("pins a unit the baseline had not placed yet", () => {
    expect(
      buildReplanMoves({
        baselineWorkUnits: [unit("total:1", null)],
        proposalWorkUnits: [unit("total:1", "2026-08-20")],
      })
    ).toEqual([
      {
        entryKey: `${GOAL}:total:1`,
        goalId: GOAL,
        unitKey: "total:1",
        scheduledDate: "2026-08-20",
      },
    ]);
  });

  it("ignores units the baseline does not know about", () => {
    // A goal that only appears in the proposal still gets pinned; the pin
    // parity check on the next solve is what catches an impossible one.
    expect(
      buildReplanMoves({
        baselineWorkUnits: [],
        proposalWorkUnits: [unit("total:9", "2026-08-20")],
      }).map((move) => move.unitKey)
    ).toEqual(["total:9"]);
  });
});
