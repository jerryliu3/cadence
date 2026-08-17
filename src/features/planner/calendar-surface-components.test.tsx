import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlannerDndProvider } from "./calendar-dnd";
import { CalendarDayPreviewList } from "./calendar-day-preview-list";
import { CalendarMonthDayCell } from "./calendar-month-day-cell";

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
        onCellDoubleClick={() => {}}
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
    expect(onEntryClick).toHaveBeenCalledWith(
      "2026-08-06",
      sampleEntry,
      expect.any(HTMLElement)
    );
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

    const toggle = within(view.container).getByRole("button", {
      name: "Mark session done",
    });
    expect(toggle.parentElement?.firstElementChild).toBe(toggle);

    await user.click(toggle);
    expect(onToggleCompletion).toHaveBeenCalledTimes(1);

    const previewEntry = view.container.querySelector(
      '[data-planner-entry-key="goal-1:cadence:0"]'
    );
    expect(previewEntry).not.toBeNull();
    await user.click(previewEntry as HTMLElement);
    expect(onEntryOpen).toHaveBeenCalledWith(sampleEntry.key);
  });

  it("exposes partner completion markers without relying on title tooltips", () => {
    renderWithDnd(
      <CalendarMonthDayCell
        day="2026-08-06"
        inMonth
        isToday={false}
        isPastInMonth={false}
        ariaLabel="Thursday, August 6, 2026."
        entriesForDay={[]}
        completionFactMarkersForDay={[
          {
            key: "partner-marker",
            goalTitle: "Partner stretch",
            scheduledDate: "2026-08-06",
            owner: "partner",
          },
        ]}
        isAnyEntryDragging={false}
        getEntryDisplayTitle={() => ""}
        isEntryCredited={() => false}
        isEntryImmovableForDraft={() => false}
        onEntryClick={() => {}}
        onCellClick={() => {}}
        onCellDoubleClick={() => {}}
        onCellMouseEnter={() => {}}
        onCellMouseLeave={() => {}}
        onCellPointerDown={() => {}}
        onCellPointerUp={() => {}}
        onCellPointerCancel={() => {}}
        onCellPointerLeave={() => {}}
        onEntryPointerStart={() => {}}
        onEntryPointerEnd={() => {}}
      />
    );

    expect(
      screen.getByLabelText("Partner stretch. Partner marked this done.")
    ).toBeInTheDocument();
    expect(screen.getByText("Partner marked this done.")).toBeInTheDocument();
  });
});

