import { describe, expect, it } from "vitest";
import {
  PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE,
} from "@/lib/planner/draft-window";
import {
  selectPlannerSaveAvailability,
} from "@/features/planner/planner-save-availability";
import { buildPlannerContext, buildPlannerPreview } from "@/features/planner/test-fixtures";

describe("selectPlannerSaveAvailability", () => {
  it("blocks save when draft window is too wide", () => {
    const availability = selectPlannerSaveAvailability({
      context: buildPlannerContext(),
      effectivePreview: buildPlannerPreview([]),
      draftSaveWindow: null,
      draftWindowTooWide: true,
      hasDraftSession: true,
      plannerReadOnly: false,
    });
    expect(availability.draftSaveBlocked).toBe(true);
    expect(availability.draftSaveBlockedMessage).toBe(
      PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE
    );
  });

  it("blocks historical publish windows", () => {
    const context = buildPlannerContext({
      overrides: {
        asOfDate: "2026-08-15",
      },
    });
    const availability = selectPlannerSaveAvailability({
      context,
      effectivePreview: buildPlannerPreview([]),
      draftSaveWindow: { start: "2026-08-01", end: "2026-08-05" },
      draftWindowTooWide: false,
      hasDraftSession: true,
      plannerReadOnly: false,
    });
    expect(availability.draftSaveBlocked).toBe(true);
    expect(availability.draftSaveBlockedMessage).toContain(
      "Publishing an elapsed window is not supported."
    );
  });

  it("marks missing active plan as unsaved changes", () => {
    const context = buildPlannerContext({
      overrides: {
        activePlan: null,
      },
    });
    const availability = selectPlannerSaveAvailability({
      context,
      effectivePreview: buildPlannerPreview([]),
      draftSaveWindow: { start: "2026-08-15", end: "2026-08-31" },
      draftWindowTooWide: false,
      hasDraftSession: false,
      plannerReadOnly: false,
    });
    expect(availability.hasUnsavedPlannerChanges).toBe(true);
    expect(availability.canShowSaveAction).toBe(true);
  });
});
