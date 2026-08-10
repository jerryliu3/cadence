import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
import type { PlannerDragTarget } from "@/features/planner/calendar-dnd";
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";
import { usePlannerEntryDnd } from "./use-planner-entry-dnd";

function buildEntry(
  overrides: Partial<PlannerDayDetailEntry> = {}
): PlannerDayDetailEntry {
  return {
    key: "goal-1:unit-1",
    originalGoalId: "goal-1",
    goalTitle: "Goal 1",
    unitKey: "unit-1",
    label: "Session 1",
    classification: "planned",
    creditState: "uncredited",
    activeGoal: null,
    activeItem: null,
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
    ...overrides,
  };
}

interface HookHarnessInput {
  entriesByDate: Map<string, PlannerDayDetailEntry[]>;
  entryByKey: Map<string, PlannerDayDetailEntry>;
  entryDayByKey: Map<string, string>;
  queueDraftMoveCommand?: (entry: {
    entry: PlannerDayDetailEntry;
    nextDate: string;
    source: "date_input" | "drag_drop";
  }) => boolean;
  suppressHoverForDrag?: () => void;
  releaseHoverSuppression?: () => void;
}

function renderDndHook({
  entriesByDate,
  entryByKey,
  entryDayByKey,
  queueDraftMoveCommand = vi.fn(() => true),
  suppressHoverForDrag = vi.fn(),
  releaseHoverSuppression = vi.fn(),
}: HookHarnessInput) {
  const setPreviewEntryOrderByDay = vi.fn<
    (next: SetStateAction<Record<string, string[]>>) => void
  >();
  const getEntryDisplayTitle = (entry: PlannerDayDetailEntry) =>
    `label:${entry.key}`;

  const hook = renderHook(() =>
    usePlannerEntryDnd({
      entriesByDate,
      entryByKey,
      entryDayByKey,
      getEntryDisplayTitle,
      queueDraftMoveCommand,
      suppressHoverForDrag,
      releaseHoverSuppression,
      setPreviewEntryOrderByDay,
    })
  );

  return {
    ...hook,
    queueDraftMoveCommand,
    suppressHoverForDrag,
    releaseHoverSuppression,
    setPreviewEntryOrderByDay,
  };
}

describe("usePlannerEntryDnd", () => {
  it("reorders same-day preview entries and clears drag state", () => {
    const day = "2026-08-05";
    const first = buildEntry({ key: "goal-1:unit-1" });
    const second = buildEntry({ key: "goal-1:unit-2", unitKey: "unit-2" });
    const credited = buildEntry({
      key: "goal-1:unit-3",
      unitKey: "unit-3",
      creditState: "credited",
    });
    const entriesByDate = new Map([[day, [first, second, credited]]]);
    const entryByKey = new Map([
      [first.key, first],
      [second.key, second],
      [credited.key, credited],
    ]);
    const entryDayByKey = new Map([
      [first.key, day],
      [second.key, day],
      [credited.key, day],
    ]);
    const queueDraftMoveCommand = vi.fn(() => true);
    const suppressHoverForDrag = vi.fn();
    const releaseHoverSuppression = vi.fn();

    const {
      result,
      setPreviewEntryOrderByDay,
      queueDraftMoveCommand: queueSpy,
      suppressHoverForDrag: suppressSpy,
      releaseHoverSuppression: releaseSpy,
    } = renderDndHook({
      entriesByDate,
      entryByKey,
      entryDayByKey,
      queueDraftMoveCommand,
      suppressHoverForDrag,
      releaseHoverSuppression,
    });

    act(() => {
      result.current.handleDndEntryDragStart(second.key);
    });
    expect(result.current.draggingEntryKey).toBe(second.key);
    expect(suppressSpy).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleDndEntryDragEnd(second.key, {
        type: "preview_entry",
        day,
        entryKey: first.key,
      });
    });

    expect(queueSpy).not.toHaveBeenCalled();
    expect(setPreviewEntryOrderByDay).toHaveBeenCalledTimes(1);
    const updater = setPreviewEntryOrderByDay.mock.calls[0]?.[0];
    expect(typeof updater).toBe("function");
    const next = (
      updater as (previous: Record<string, string[]>) => Record<string, string[]>
    )({});
    expect(next[day]).toEqual([second.key, first.key, credited.key]);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(result.current.draggingEntryKey).toBeNull();
  });

  it("queues cross-day drag drops as draft move commands", () => {
    const entry = buildEntry({ key: "goal-1:unit-9", unitKey: "unit-9" });
    const sourceDay = "2026-08-05";
    const targetDay = "2026-08-06";
    const queueDraftMoveCommand = vi.fn(() => true);

    const { result, queueDraftMoveCommand: queueSpy, releaseHoverSuppression } =
      renderDndHook({
        entriesByDate: new Map([[sourceDay, [entry]]]),
        entryByKey: new Map([[entry.key, entry]]),
        entryDayByKey: new Map([[entry.key, sourceDay]]),
        queueDraftMoveCommand,
      });

    act(() => {
      result.current.handleDndEntryDragStart(entry.key);
      result.current.handleDndEntryDragEnd(entry.key, {
        type: "day",
        day: targetDay,
      });
    });

    expect(queueSpy).toHaveBeenCalledWith({
      entry,
      nextDate: targetDay,
      source: "drag_drop",
    });
    expect(releaseHoverSuppression).toHaveBeenCalledTimes(1);
    expect(result.current.draggingEntryKey).toBeNull();
  });

  it("does not reorder between incomplete and credited groups", () => {
    const day = "2026-08-05";
    const incomplete = buildEntry({ key: "goal-1:unit-1" });
    const credited = buildEntry({
      key: "goal-1:unit-2",
      unitKey: "unit-2",
      creditState: "credited",
    });
    const setPreviewEntryOrderByDay = vi.fn<
      (next: SetStateAction<Record<string, string[]>>) => void
    >();
    const queueDraftMoveCommand = vi.fn(() => true);
    const releaseHoverSuppression = vi.fn();

    const { result } = renderHook(() =>
      usePlannerEntryDnd({
        entriesByDate: new Map([[day, [incomplete, credited]]]),
        entryByKey: new Map([
          [incomplete.key, incomplete],
          [credited.key, credited],
        ]),
        entryDayByKey: new Map([
          [incomplete.key, day],
          [credited.key, day],
        ]),
        getEntryDisplayTitle: (entry) => entry.key,
        queueDraftMoveCommand,
        suppressHoverForDrag: vi.fn(),
        releaseHoverSuppression,
        setPreviewEntryOrderByDay,
      })
    );

    act(() => {
      result.current.handleDndEntryDragEnd(incomplete.key, {
        type: "preview_entry",
        day,
        entryKey: credited.key,
      });
    });

    expect(setPreviewEntryOrderByDay).not.toHaveBeenCalled();
    expect(queueDraftMoveCommand).not.toHaveBeenCalled();
    expect(releaseHoverSuppression).toHaveBeenCalledTimes(1);
  });

  it("cancels drag state and keeps labels accessible", () => {
    const day = "2026-08-05";
    const entry = buildEntry({ key: "goal-2:unit-1", originalGoalId: "goal-2" });
    const {
      result,
      suppressHoverForDrag,
      releaseHoverSuppression,
      queueDraftMoveCommand,
    } = renderDndHook({
      entriesByDate: new Map([[day, [entry]]]),
      entryByKey: new Map([[entry.key, entry]]),
      entryDayByKey: new Map([[entry.key, day]]),
    });

    act(() => {
      result.current.handleDndEntryDragStart(entry.key);
    });
    expect(result.current.draggingEntryKey).toBe(entry.key);
    expect(suppressHoverForDrag).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleDndEntryDragCancel(entry.key);
    });
    expect(releaseHoverSuppression).toHaveBeenCalledTimes(1);
    expect(result.current.draggingEntryKey).toBeNull();
    expect(queueDraftMoveCommand).not.toHaveBeenCalled();

    expect(result.current.getDragEntryLabel(entry.key)).toBe(`label:${entry.key}`);
    expect(result.current.getDragEntryLabel("missing-entry")).toBe("planner session");
    expect(result.current.getDragDayLabel("not-a-date")).toBe("not-a-date");
    expect(result.current.getDragDayLabel(day)).not.toBe(day);
  });

  it("ignores drops that do not resolve to targets", () => {
    const entry = buildEntry({ key: "goal-1:unit-4", unitKey: "unit-4" });
    const target = null satisfies PlannerDragTarget;
    const releaseHoverSuppression = vi.fn();
    const queueDraftMoveCommand = vi.fn(() => true);

    const { result } = renderHook(() =>
      usePlannerEntryDnd({
        entriesByDate: new Map([["2026-08-05", [entry]]]),
        entryByKey: new Map([[entry.key, entry]]),
        entryDayByKey: new Map([[entry.key, "2026-08-05"]]),
        getEntryDisplayTitle: (candidate) => candidate.key,
        queueDraftMoveCommand,
        suppressHoverForDrag: vi.fn(),
        releaseHoverSuppression,
        setPreviewEntryOrderByDay: vi.fn(),
      })
    );

    act(() => {
      result.current.handleDndEntryDragEnd(entry.key, target);
    });

    expect(queueDraftMoveCommand).not.toHaveBeenCalled();
    expect(releaseHoverSuppression).toHaveBeenCalledTimes(1);
  });
});
