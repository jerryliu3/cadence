import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlannerDndProvider } from "./calendar-dnd";
import { CalendarDayPreviewList } from "./calendar-day-preview-list";
import { CalendarMonthDayCell } from "./calendar-month-day-cell";
import { CalendarSurfaceHeader } from "./calendar-surface-header";

function renderWithDnd(ui: ReactNode) {
  return render(
    <PlannerDndProvider
      getEntryLabel={(entryKey) => entryKey}
      getDayLabel={(day) => day}
      onEntryDragStart={() => {}}
      onEntryDragEnd={() => {}}
      onEntryDragCancel={() => {}}
    >
      {ui}
    </PlannerDndProvider>
  );
}

const sampleEntry = {
  key: "goal-1:cadence:0",
  originalGoalId: "goal-1",
  goalTitle: "Run",
  unitKey: "cadence:0",
  label: "Easy run",
  classification: "planned",
  creditState: "uncredited",
  activeGoal: {
    color: "#22c55e",
  },
  activeItem: {
    credited_completion_id: null,
  },
  draftDiffKind: null,
  draftDiffFromDate: null,
  draftDiffToDate: null,
  draftGhost: false,
};

const sampleMarker = {
  key: "marker-1",
  goalTitle: "Stretch",
  scheduledDate: "2026-08-05",
};

describe("calendar surface extracted components", () => {
  it("renders month day cell and delegates click behavior", async () => {
    const onCellClick = vi.fn();
    const onCellPointerDown = vi.fn();
    const onEntryPointerStart = vi.fn();
    const onEntryClick = vi.fn();
    const user = userEvent.setup();

    renderWithDnd(
      <CalendarMonthDayCell
        day="2026-08-06"
        inMonth
        isToday={false}
        isPastInMonth={false}
        ariaLabel="Thursday, August 6, 2026. 1 planned item."
        entriesForDay={[sampleEntry]}
        completionFactMarkersForDay={[sampleMarker]}
        isAnyEntryDragging={false}
        getEntryDisplayTitle={(entry) => entry.label ?? "Untitled"}
        isEntryCredited={() => false}
        isEntryImmovableForDraft={() => false}
        onEntryClick={onEntryClick}
        onCellClick={onCellClick}
        onCellMouseEnter={() => {}}
        onCellMouseLeave={() => {}}
        onCellPointerDown={onCellPointerDown}
        onCellPointerUp={() => {}}
        onCellPointerCancel={() => {}}
        onCellPointerLeave={() => {}}
        onEntryPointerStart={onEntryPointerStart}
        onEntryPointerEnd={() => {}}
      />
    );

    expect(screen.getByText("Easy run")).toBeInTheDocument();
    expect(screen.getByText("Stretch")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /thursday, august 6/i }));
    expect(onCellClick).toHaveBeenCalledTimes(1);
    onCellPointerDown.mockClear();

    await user.pointer({
      target: screen.getByText("Easy run"),
      keys: "[MouseLeft>]",
    });
    expect(onEntryPointerStart).toHaveBeenCalledWith(false);
    expect(onCellPointerDown).not.toHaveBeenCalled();
    await user.click(screen.getByText("Easy run"));
    expect(onEntryClick).toHaveBeenCalledWith("2026-08-06", sampleEntry);
  });

  it("renders preview list and supports opening and completion toggle", async () => {
    const onEntryOpen = vi.fn();
    const onToggleCompletion = vi.fn();
    const user = userEvent.setup();

    const view = renderWithDnd(
      <CalendarDayPreviewList
        day="2026-08-06"
        entries={[sampleEntry]}
        completionFactMarkers={[]}
        mutationLoading={false}
        getEntryDisplayTitle={(entry) => entry.goalTitle ?? "Untitled"}
        getEntrySubtitle={(entry) => entry.label}
        isEntryCredited={() => false}
        isEntryImmovableForDraft={() => false}
        getCompletionToggleState={() => ({
          currentlyCredited: false,
          disabledReasonCopy: null,
        })}
        onEntryOpen={onEntryOpen}
        onToggleCompletion={onToggleCompletion}
        onEntryPointerStart={() => {}}
        onEntryPointerEnd={() => {}}
      />
    );

    await user.click(
      within(view.container).getByRole("button", { name: "Mark session done" })
    );
    expect(onToggleCompletion).toHaveBeenCalledTimes(1);

    await user.click(within(view.container).getByText("Run"));
    expect(onEntryOpen).toHaveBeenCalledWith(sampleEntry.key);
  });

  it("renders header action gates for reset and save states", async () => {
    const onResetPlan = vi.fn();
    const onSavePlan = vi.fn();
    const onDiscardDraftChanges = vi.fn();
    const onOpenSettings = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <CalendarSurfaceHeader
        hasDraftSession
        horizonCounter={{ thisMonth: 2, total: 5, remaining: 3 }}
        eligibilityNotices={{ hardIneligible: [], scopeOnlyCount: 0 }}
        canResetPlan
        resetLoading={false}
        loading={false}
        canShowSaveAction={false}
        saveButtonLabel="Save plan"
        saveDisabled={false}
        onResetPlan={onResetPlan}
        onSavePlan={onSavePlan}
        onDiscardDraftChanges={onDiscardDraftChanges}
        onOpenSettings={onOpenSettings}
        showSettingsButton
        discardDisabled={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "Reset plan" }));
    expect(onResetPlan).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Undo changes" }));
    expect(onDiscardDraftChanges).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Save plan" })
    ).not.toBeInTheDocument();

    rerender(
      <CalendarSurfaceHeader
        hasDraftSession={false}
        horizonCounter={null}
        eligibilityNotices={{ hardIneligible: [], scopeOnlyCount: 0 }}
        canResetPlan={false}
        resetLoading={false}
        loading={false}
        canShowSaveAction
        saveButtonLabel="Save plan"
        saveDisabled
        saveTitle="Missing draft edits"
        onResetPlan={onResetPlan}
        onSavePlan={onSavePlan}
        onDiscardDraftChanges={onDiscardDraftChanges}
        onOpenSettings={onOpenSettings}
        showSettingsButton={false}
        discardDisabled={false}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Reset plan" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
  });
});

