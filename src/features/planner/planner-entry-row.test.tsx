import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPlannerEntryRowState,
  PlannerEntryRow,
  type PlannerEntryRowBaseEntry,
} from "./planner-entry-row";

function buildEntry(
  overrides: Partial<PlannerEntryRowBaseEntry> = {}
): PlannerEntryRowBaseEntry {
  return {
    key: "goal-1:cadence:0",
    originalGoalId: "goal-1",
    goalTitle: "Run",
    unitKey: "cadence:0",
    label: "Easy run",
    classification: "planned",
    creditState: "uncredited",
    activeGoal: { color: "#22c55e" },
    activeItem: { credited_completion_id: null },
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
    ...overrides,
  };
}

// This project does not enable vitest `globals`, so RTL auto-cleanup is off and
// rendered DOM would otherwise leak between cases in the same file.
afterEach(() => {
  cleanup();
});

describe("buildPlannerEntryRowState", () => {
  it("treats a non-uncredited credit state as credited", () => {
    expect(buildPlannerEntryRowState(buildEntry()).credited).toBe(false);
    expect(
      buildPlannerEntryRowState(buildEntry({ creditState: "credited" })).credited
    ).toBe(true);
  });

  it("treats a credited completion id as credited even when the state lags", () => {
    const state = buildPlannerEntryRowState(
      buildEntry({ activeItem: { credited_completion_id: "completion-1" } })
    );
    expect(state.credited).toBe(true);
  });

  it("lets callers override credited without touching the entry", () => {
    const state = buildPlannerEntryRowState(buildEntry(), {
      creditedOverride: true,
    });
    expect(state.credited).toBe(true);
  });

  it("derives a draft diff summary and pill tone for moved entries", () => {
    const state = buildPlannerEntryRowState(
      buildEntry({
        draftDiffKind: "moved_to",
        draftDiffFromDate: "2026-08-10",
        draftDiffToDate: "2026-08-14",
      })
    );
    expect(state.draftDiffSummary).not.toBeNull();
    expect(state.pillToneClasses.length).toBeGreaterThan(0);
  });

  it("uses the goal color for the visual accent", () => {
    expect(
      buildPlannerEntryRowState(buildEntry({ activeGoal: { color: "#2563eb" } }))
        .visual.color
    ).toBe("#2563eb");
  });
});

describe("PlannerEntryRow", () => {
  it("renders only the title and credit marker in compact variant", () => {
    render(
      <PlannerEntryRow
        entry={buildEntry({ creditState: "credited" })}
        displayTitle="09:00 Run"
        subtitle="Should be hidden"
        variant="compact"
      />
    );

    expect(screen.getByText("09:00 Run")).toBeInTheDocument();
    // Compact cells only have room for the title, so subtitle and diff copy are
    // deliberately dropped rather than truncated.
    expect(screen.queryByText("Should be hidden")).not.toBeInTheDocument();
  });

  it("renders subtitle and draft diff summary in preview variant", () => {
    render(
      <PlannerEntryRow
        entry={buildEntry({
          draftDiffKind: "moved_to",
          draftDiffFromDate: "2026-08-10",
          draftDiffToDate: "2026-08-14",
        })}
        displayTitle="Run"
        subtitle="Cadence session"
        variant="preview"
      />
    );

    expect(screen.getByText("Run")).toBeInTheDocument();
    expect(screen.getByText("Cadence session")).toBeInTheDocument();
    expect(screen.getByText(/2026-08-10/)).toBeInTheDocument();
  });

  it("renders the detail hint only in detail variant", () => {
    const { unmount } = render(
      <PlannerEntryRow
        entry={buildEntry()}
        displayTitle="Run"
        variant="preview"
        detailHintText="Tap to edit"
      />
    );
    expect(screen.queryByText("Tap to edit")).not.toBeInTheDocument();
    unmount();

    render(
      <PlannerEntryRow
        entry={buildEntry()}
        displayTitle="Run"
        variant="detail"
        detailHintText="Tap to edit"
      />
    );
    expect(screen.getByText("Tap to edit")).toBeInTheDocument();
  });

  it("prefers a caller-supplied row state over recomputing it", () => {
    const rowState = buildPlannerEntryRowState(buildEntry(), {
      creditedOverride: true,
    });
    render(
      <PlannerEntryRow
        entry={buildEntry()}
        rowState={rowState}
        displayTitle="Run"
        variant="compact"
      />
    );

    expect(screen.getByText("Run")).toBeInTheDocument();
  });
});
