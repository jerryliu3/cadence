import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlannerEntryDateFactDispatch } from "@/features/planner/calendar-completion-selectors";
import type {
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import { PlannerDayDetailDialogs } from "./planner-day-detail-dialogs";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: ReactNode;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({
    id,
    children,
  }: {
    id?: string;
    children: ReactNode;
  }) => <p id={id}>{children}</p>,
}));

function buildEntry(
  overrides: Partial<PlannerDayDetailEntry> = {}
): PlannerDayDetailEntry {
  return {
    key: "goal-a:unit-1",
    originalGoalId: "goal-a",
    goalTitle: "Long Run",
    unitKey: "unit-1",
    label: "Sunday run",
    classification: "planned",
    creditState: "uncredited",
    activeGoal: {
      id: "plan-goal-1",
      goal_id: "goal-a",
      original_goal_id: "goal-a",
      requirement_fingerprint: "fp",
      title: "Long Run",
      category: "fitness",
      color: "#22c55e",
    },
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
      scheduled_time_override: "08:00",
      effective_scheduled_local_time: "08:00",
    },
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
    effectiveScheduledLocalTime: "08:00",
    ...overrides,
  };
}

function buildWorkUnit(overrides: Partial<PlannerWorkUnit> = {}): PlannerWorkUnit {
  return {
    originalGoalId: "goal-a",
    unitKey: "unit-1",
    label: "Sunday run",
    scheduledDate: "2026-08-12",
    classification: "planned",
    creditState: "uncredited",
    scheduledTimeOverride: "08:00",
    effectiveScheduledLocalTime: "08:00",
    ...overrides,
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
  overrides: Partial<ComponentProps<typeof PlannerDayDetailDialogs>> = {}
): ComponentProps<typeof PlannerDayDetailDialogs> {
  return {
    dayDetailDay: "2026-08-12",
    selectedDayEntries: [buildEntry()],
    selectedEventEntry: null,
    selectedEventDraftEdit: undefined,
    selectedEventBaselineUnit: null,
    mutationLoadingKey: null,
    canMutatePlanItems: true,
    closeDayDetails: vi.fn(),
    closeEventDetails: vi.fn(),
    selectEventEntry: vi.fn(),
    toggleDateFact: vi.fn(async () => {}),
    toggleItemLock: vi.fn(async () => {}),
    updateDraftLabel: vi.fn(),
    updateDraftScheduledDate: vi.fn(),
    updateDraftScheduledTimeOverride: vi.fn(),
    getEntryDisplayTitleWithTime: (entry) =>
      entry.effectiveScheduledLocalTime
        ? `${entry.goalTitle} (${entry.effectiveScheduledLocalTime})`
        : entry.goalTitle ?? "Untitled",
    getDateFactDispatchForEntry: () => buildDispatch(),
    completionControlDisabledReasonForEntry: () => null,
    ...overrides,
  };
}

describe("PlannerDayDetailDialogs", () => {
  it("opens day-detail list and selects event entry", async () => {
    const user = userEvent.setup();
    const selectEventEntry = vi.fn();
    const entry = buildEntry({
      key: "goal-a:unit-2",
      goalTitle: "Tempo",
      label: "Tempo run",
    });

    const props = createProps({
      dayDetailDay: "2026-08-13",
      selectedDayEntries: [entry],
      selectEventEntry,
    });
    render(<PlannerDayDetailDialogs {...props} />);

    expect(screen.getByText("Review and update planned sessions for this date.")).toBeInTheDocument();
    await user.click(screen.getByText("View event details"));

    expect(selectEventEntry).toHaveBeenCalledWith("goal-a:unit-2");
  });

  it("renders event detail editor and dispatches edit/update actions", async () => {
    const user = userEvent.setup();
    const selectedEventEntry = buildEntry();
    const selectedEventBaselineUnit = buildWorkUnit();
    const updateDraftLabel = vi.fn();
    const updateDraftScheduledDate = vi.fn();
    const updateDraftScheduledTimeOverride = vi.fn();
    const toggleDateFact = vi.fn(async () => {});
    const toggleItemLock = vi.fn(async () => {});

    const props = createProps({
      dayDetailDay: null,
      selectedDayEntries: [],
      selectedEventEntry,
      selectedEventDraftEdit: {
        label: "Draft label",
        scheduledDate: "2026-08-20",
        scheduledTimeOverride: "09:30",
      },
      selectedEventBaselineUnit,
      updateDraftLabel,
      updateDraftScheduledDate,
      updateDraftScheduledTimeOverride,
      toggleDateFact,
      toggleItemLock,
    });
    render(<PlannerDayDetailDialogs {...props} />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Renamed session" },
    });
    fireEvent.change(screen.getByLabelText("Move to"), {
      target: { value: "2026-08-21" },
    });
    fireEvent.change(screen.getByLabelText("Time"), {
      target: { value: "10:15" },
    });

    expect(updateDraftLabel).toHaveBeenLastCalledWith(selectedEventEntry, "Renamed session");
    expect(updateDraftScheduledDate).toHaveBeenLastCalledWith(
      selectedEventEntry,
      "2026-08-21"
    );
    expect(updateDraftScheduledTimeOverride).toHaveBeenCalledWith(
      selectedEventEntry,
      "10:15"
    );

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(updateDraftScheduledTimeOverride).toHaveBeenLastCalledWith(
      selectedEventEntry,
      ""
    );

    await user.click(screen.getByRole("button", { name: "Lock" }));
    await user.click(screen.getByRole("button", { name: "Mark done" }));

    expect(toggleItemLock).toHaveBeenCalledWith(selectedEventEntry);
    expect(toggleDateFact).toHaveBeenCalledWith(selectedEventEntry);
  });
});
