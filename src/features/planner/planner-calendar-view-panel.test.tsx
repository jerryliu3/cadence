import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlannerEntryDateFactDispatch } from "@/features/planner/calendar-completion-selectors";
import type {
  PlannerCompletionFactMarker,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { PlannerCalendarDayCellRenderModel } from "@/features/planner/calendar-selectors";
import { PlannerCalendarViewPanel } from "./planner-calendar-view-panel";

vi.mock("@/features/planner/calendar-dnd", () => ({
  PlannerDndProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="planner-dnd-provider">{children}</div>
  ),
}));

vi.mock("@/features/planner/calendar-day-preview-list", () => ({
  CalendarDayPreviewList: ({
    day,
    entries,
    onEntryOpen,
    onToggleCompletion,
  }: {
    day: string;
    entries: PlannerDayDetailEntry[];
    onEntryOpen: (entryKey: string) => void;
    onToggleCompletion: (entry: PlannerDayDetailEntry, day: string) => void;
  }) => (
    <div data-testid={`preview-list-${day}`}>
      <button
        type="button"
        onClick={() => {
          if (entries.length > 0) {
            onEntryOpen(entries[0].key);
          }
        }}
      >
        open-entry
      </button>
      <button
        type="button"
        onClick={() => {
          if (entries.length > 0) {
            onToggleCompletion(entries[0], day);
          }
        }}
      >
        toggle-entry
      </button>
    </div>
  ),
}));

function buildEntry(
  overrides: Partial<PlannerDayDetailEntry> = {}
): PlannerDayDetailEntry {
  return {
    key: "goal-a:unit-1",
    originalGoalId: "goal-a",
    goalTitle: "Goal A",
    unitKey: "unit-1",
    label: "Goal A",
    classification: "planned",
    creditState: "uncredited",
    activeGoal: null,
    activeItem: {
      id: "item-1",
      plan_goal_id: "plan-goal-1",
      unit_key: "unit-1",
      requirement_kind: "cadence",
      scheduled_date: "2026-08-12",
      classification: "planned",
      credit_state: "uncredited",
      locked: false,
      revision: 1,
      credited_completion_id: null,
      credited_completion_date: null,
    },
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
    ...overrides,
  };
}

function buildCellModel(day: string): PlannerCalendarDayCellRenderModel {
  return {
    day,
    inMonth: true,
    isToday: false,
    isPastInMonth: false,
    ariaLabel: `${day} label`,
    entriesForDay: [],
    completionFactMarkersForDay: [],
  };
}

function buildDispatch(): PlannerEntryDateFactDispatch {
  return {
    currentlyCredited: false,
    desiredFactState: "present",
    decision: {
      allowed: true,
      reason: "allowed",
      route: "item_date",
      exactDateOnly: true,
    },
  };
}

function createProps(
  overrides: Partial<ComponentProps<typeof PlannerCalendarViewPanel>> = {}
): ComponentProps<typeof PlannerCalendarViewPanel> {
  const defaultEntry = buildEntry();
  const cellModels = [buildCellModel("2026-08-10"), buildCellModel("2026-08-11")];
  const renderCalendarDayCell = vi.fn((model: PlannerCalendarDayCellRenderModel) => (
    <div key={model.day} data-testid={`cell-${model.day}`}>
      {model.ariaLabel}
    </div>
  ));

  return {
    viewMode: "month",
    plannerViewModes: [
      { value: "month", label: "Month" },
      { value: "week", label: "Week" },
      { value: "day", label: "Day" },
    ],
    loading: false,
    viewHeading: "August 2026",
    viewHeadingControlWidth: "min(100%, 20rem)",
    previousWindowAriaLabel: "Previous month",
    nextWindowAriaLabel: "Next month",
    moveViewWindow: vi.fn(),
    canResetViewWindow: true,
    resetViewWindow: vi.fn(),
    expandedMonthRows: false,
    setExpandedMonthRows: vi.fn(),
    setCalendarViewMode: vi.fn(),
    viewDescription: "Month view description",
    getDragEntryLabel: (entryKey) => entryKey,
    getDragDayLabel: (day) => day,
    renderEntryDragOverlay: (entryKey) => entryKey,
    handleDndEntryDragStart: vi.fn(),
    handleDndEntryDragEnd: vi.fn(),
    handleDndEntryDragCancel: vi.fn(),
    focusedDay: "2026-08-12",
    focusedDayEntries: [defaultEntry],
    focusedDayCompletionFactMarkers: [] as PlannerCompletionFactMarker[],
    previewDayEntries: [defaultEntry],
    previewDayCompletionFactMarkers: [] as PlannerCompletionFactMarker[],
    mutationLoading: false,
    getEntryDisplayTitleWithTime: (entry) => entry.label ?? "Untitled",
    getEntrySubtitle: () => null,
    isEntryCredited: () => false,
    canMutateEntryOnDay: () => true,
    isEntryImmovableForDraft: () => false,
    readOnlyMonthHint: "Read-only month",
    getDateFactDispatchForEntry: () => buildDispatch(),
    completionControlDisabledReasonForEntry: () => null,
    openDayDetails: vi.fn(),
    toggleDateFact: vi.fn(async () => {}),
    suppressHoverForDrag: vi.fn(),
    releaseHoverSuppression: vi.fn(),
    weekdayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    calendarGridDayCellModels: cellModels,
    renderCalendarDayCell,
    draftSaveBlockedMessage: null,
    dayPreview: null,
    dayPreviewRef: { current: null },
    pinDayPreview: vi.fn(),
    handleDayPreviewMouseEnter: vi.fn(),
    handleDayPreviewMouseLeave: vi.fn(),
    clearDayPreview: vi.fn(),
    onSelectedDayChange: vi.fn(),
    ...overrides,
  };
}

describe("PlannerCalendarViewPanel", () => {
  it("renders month controls and maps precomputed day-cell models", async () => {
    const user = userEvent.setup();
    const moveViewWindow = vi.fn();
    const setCalendarViewMode = vi.fn();
    const resetViewWindow = vi.fn();
    const renderCalendarDayCell = vi.fn((model: PlannerCalendarDayCellRenderModel) => (
      <div key={model.day} data-testid={`mapped-cell-${model.day}`}>
        {model.day}
      </div>
    ));

    const props = createProps({
      moveViewWindow,
      setCalendarViewMode,
      resetViewWindow,
      renderCalendarDayCell,
    });
    render(<PlannerCalendarViewPanel {...props} />);

    expect(renderCalendarDayCell).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("mapped-cell-2026-08-10")).toBeInTheDocument();
    expect(screen.getByTestId("mapped-cell-2026-08-11")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Go to today" }));
    await user.click(screen.getByRole("button", { name: "Week" }));

    expect(moveViewWindow).toHaveBeenCalledWith(-1);
    expect(moveViewWindow).toHaveBeenCalledWith(1);
    expect(resetViewWindow).toHaveBeenCalledTimes(1);
    expect(setCalendarViewMode).toHaveBeenCalledWith("week");
  });

  it("routes preview popup Day view action through callbacks", async () => {
    const user = userEvent.setup();
    const clearDayPreview = vi.fn();
    const onSelectedDayChange = vi.fn();

    const props = createProps({
      dayPreview: {
        day: "2026-08-15",
        pinned: true,
        position: {
          top: 80,
          left: 20,
          width: 260,
          placement: "below",
        },
      },
      clearDayPreview,
      onSelectedDayChange,
    });
    render(<PlannerCalendarViewPanel {...props} />);

    await user.click(screen.getByRole("button", { name: "Day view" }));

    expect(clearDayPreview).toHaveBeenCalledTimes(1);
    expect(onSelectedDayChange).toHaveBeenCalledWith("2026-08-15", "push", "day");
  });

  it("routes day-mode preview list actions to detail and completion handlers", async () => {
    const user = userEvent.setup();
    const entry = buildEntry();
    const openDayDetails = vi.fn();
    const toggleDateFact = vi.fn(async () => {});

    const props = createProps({
      viewMode: "day",
      focusedDay: "2026-08-12",
      focusedDayEntries: [entry],
      openDayDetails,
      toggleDateFact,
    });
    render(<PlannerCalendarViewPanel {...props} />);

    const dayList = screen.getByTestId("preview-list-2026-08-12");
    await user.click(within(dayList).getByRole("button", { name: "open-entry" }));
    await user.click(within(dayList).getByRole("button", { name: "toggle-entry" }));

    expect(openDayDetails).toHaveBeenCalledWith("2026-08-12");
    expect(toggleDateFact).toHaveBeenCalledWith(entry, "2026-08-12");
  });
});
