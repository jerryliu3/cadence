import { describe, expect, it } from "vitest";
import { createEmptyMobilePlannerDraft } from "./mobile-planner-draft";
import { applyCoachPatchesToMobileDraft } from "./coach-policy";

describe("applyCoachPatchesToMobileDraft", () => {
  it("applies policy changes and queues concrete server-resolved session moves", () => {
    const result = applyCoachPatchesToMobileDraft({
      state: createEmptyMobilePlannerDraft(),
      policy: {
        schemaVersion: "1",
        restWeekdays: [],
        blackoutRanges: [],
      },
      workUnits: [
        {
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-20",
          label: "Run",
          classification: "scheduled",
          creditState: "uncredited",
        },
      ],
      patches: [
        { kind: "set_rest_weekdays", restWeekdays: [6, 0, 6] },
        {
          kind: "move_session",
          goalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-09-02",
        },
      ],
    });

    expect(result.appliedPolicyPatchCount).toBe(1);
    expect(result.queuedSessionMoves).toBe(1);
    expect(result.missingSessionMoves).toBe(0);
    expect(result.state.policy).toMatchObject({ restWeekdays: [0, 6] });
    expect(result.state.commands[0]).toMatchObject({
      goalId: "goal-a",
      unitKey: "total:1",
      sourceDate: "2026-08-20",
      scheduledDate: "2026-09-02",
    });
  });

  it("reports a move whose resolved session is outside the draft", () => {
    const result = applyCoachPatchesToMobileDraft({
      state: createEmptyMobilePlannerDraft(),
      policy: {
        schemaVersion: "1",
        restWeekdays: [],
        blackoutRanges: [],
      },
      workUnits: [],
      patches: [
        {
          kind: "move_session",
          goalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-09-02",
        },
      ],
    });

    expect(result.queuedSessionMoves).toBe(0);
    expect(result.missingSessionMoves).toBe(1);
    expect(result.state.commands).toEqual([]);
  });
});
