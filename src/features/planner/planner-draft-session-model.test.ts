import { describe, expect, it } from "vitest";
import {
  draftCommandReducer,
  initialDraftCommandState,
} from "@/features/planner/draft-command-reducer";
import { selectPlannerDraftSessionModel } from "@/features/planner/planner-draft-session-model";
import {
  buildPlannerContext,
  buildPlannerPolicy,
  buildPlannerPreview,
  buildPlannerWorkUnit,
} from "@/features/planner/test-fixtures";

describe("selectPlannerDraftSessionModel", () => {
  it("derives effective preview from context when no draft preview exists", () => {
    const context = buildPlannerContext();
    const model = selectPlannerDraftSessionModel({
      context,
      draftPreview: null,
      draftPolicy: null,
      draftCommandState: initialDraftCommandState,
      currentScopeMonth: "2026-08",
    });

    expect(model.effectivePreview).toEqual(context.preview);
    expect(model.hasDraftSession).toBe(false);
  });

  it("marks draft session active when a draft policy exists", () => {
    const context = buildPlannerContext();
    const model = selectPlannerDraftSessionModel({
      context,
      draftPreview: null,
      draftPolicy: buildPlannerPolicy({ restWeekdays: [0, 6] }),
      draftCommandState: initialDraftCommandState,
      currentScopeMonth: "2026-08",
    });

    expect(model.hasDraftSession).toBe(true);
  });

  it("computes a save window when commands move entries", () => {
    const unit = buildPlannerWorkUnit({
      originalGoalId: "goal-1",
      unitKey: "unit-1",
      scheduledDate: "2026-08-12",
    });
    const context = buildPlannerContext({
      workUnits: [unit],
      overrides: {
        preview: buildPlannerPreview([unit]),
      },
    });
    const draftCommandState = draftCommandReducer(initialDraftCommandState, {
      type: "upsert_move",
      itemId: "item-1",
      goalId: "goal-1",
      unitKey: "unit-1",
      scheduledDate: "2026-08-20",
      sourceDate: "2026-08-12",
    });
    const model = selectPlannerDraftSessionModel({
      context,
      draftPreview: null,
      draftPolicy: null,
      draftCommandState,
      currentScopeMonth: "2026-08",
    });

    expect(model.draftSaveWindowResult.ok).toBe(true);
    expect(model.draftSaveWindow).not.toBeNull();
    expect(model.draftWindowTooWide).toBe(false);
  });
});
