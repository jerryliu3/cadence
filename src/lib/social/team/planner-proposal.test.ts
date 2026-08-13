import { describe, expect, it } from "vitest";
import {
  applyPlannerProposalOperations,
  PlannerProposalApplyError,
} from "@/lib/social/team/planner-proposal";

const item = {
  goalId: "11111111-1111-4111-8111-111111111111",
  unitKey: "unit-1",
  scheduledDate: "2026-08-03",
  scheduledTime: "09:30",
  locked: false,
};

describe("applyPlannerProposalOperations", () => {
  it("preserves scheduled time when a move omits toTime", () => {
    const next = applyPlannerProposalOperations({
      scopeMonth: "2026-08",
      items: [item],
      operations: [
        {
          op: "move_item",
          goalId: item.goalId,
          unitKey: item.unitKey,
          toDate: "2026-08-10",
        },
      ],
    });
    expect(next[0]).toMatchObject({
      scheduledDate: "2026-08-10",
      scheduledTime: "09:30",
    });
  });

  it("throws a typed error for dates outside the scope month", () => {
    expect(() =>
      applyPlannerProposalOperations({
        scopeMonth: "2026-08",
        items: [item],
        operations: [
          {
            op: "move_item",
            goalId: item.goalId,
            unitKey: item.unitKey,
            toDate: "2026-09-01",
          },
        ],
      })
    ).toThrow(PlannerProposalApplyError);
  });
});
