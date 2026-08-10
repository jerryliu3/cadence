import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type {
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import type { DraftCommandAction } from "@/features/planner/draft-command-reducer";
import { usePlannerDraftEntryActions } from "./use-planner-draft-entry-actions";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function buildContext(
  overrides: Partial<PlannerContextPayload> = {}
): PlannerContextPayload {
  return {
    schemaVersion: "1",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-10",
    timezone: "UTC",
    goalTitles: { "goal-1": "Goal 1" },
    preferences: null,
    capabilities: { calendarEnabled: true },
    activePlan: null,
    preview: null,
    revisions: {
      canonicalRevision: 1,
      executionRevision: 1,
      scheduleDigest: "digest-1",
    },
    staleness: {
      stale: false,
      reasons: [],
    },
    ...overrides,
  };
}

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

function buildPreviewUnit(
  overrides: Partial<PlannerWorkUnit> = {}
): PlannerWorkUnit {
  return {
    originalGoalId: "goal-1",
    unitKey: "unit-1",
    label: "Session 1",
    scheduledDate: "2026-08-05",
    classification: "scheduled",
    creditState: "uncredited",
    draftMoveWindow: {
      start: "2026-08-01",
      end: "2026-08-31",
    },
    ...overrides,
  };
}

describe("usePlannerDraftEntryActions", () => {
  const toastMock = vi.mocked(toast);

  beforeEach(() => {
    toastMock.error.mockReset();
    toastMock.success.mockReset();
  });

  it("queues a valid draft move command and schedules preview refresh", () => {
    const entry = buildEntry();
    const context = buildContext();
    const dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>();
    const scheduleDraftMovePreviewRefresh = vi.fn();
    const previewUnitByEntryKey = new Map<string, PlannerWorkUnit>([
      [entry.key, buildPreviewUnit()],
    ]);
    const entriesByDate = new Map<string, PlannerDayDetailEntry[]>([
      ["2026-08-05", [entry]],
    ]);
    const completionFactUnitsByGoalDate = new Map<string, PlannerWorkUnit[]>();

    const { result } = renderHook(() =>
      usePlannerDraftEntryActions({
        context,
        entriesByDate,
        previewUnitByEntryKey,
        completionFactUnitsByGoalDate,
        dispatchDraftCommand,
        scheduleDraftMovePreviewRefresh,
      })
    );

    let queued = false;
    act(() => {
      queued = result.current.queueDraftMoveCommand({
        entry,
        nextDate: "2026-08-10",
        source: "drag_drop",
      });
    });

    expect(queued).toBe(true);
    expect(dispatchDraftCommand).toHaveBeenCalledWith({
      type: "upsert_move",
      scopeMonth: "2026-08",
      goalId: "goal-1",
      unitKey: "unit-1",
      scheduledDate: "2026-08-10",
    });
    expect(scheduleDraftMovePreviewRefresh).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid draft move dates", () => {
    const entry = buildEntry();
    const dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>();
    const scheduleDraftMovePreviewRefresh = vi.fn();

    const { result } = renderHook(() =>
      usePlannerDraftEntryActions({
        context: buildContext(),
        entriesByDate: new Map([["2026-08-05", [entry]]]),
        previewUnitByEntryKey: new Map([[entry.key, buildPreviewUnit()]]),
        completionFactUnitsByGoalDate: new Map(),
        dispatchDraftCommand,
        scheduleDraftMovePreviewRefresh,
      })
    );

    let queued = true;
    act(() => {
      queued = result.current.queueDraftMoveCommand({
        entry,
        nextDate: "invalid-date",
        source: "date_input",
      });
    });

    expect(queued).toBe(false);
    expect(dispatchDraftCommand).not.toHaveBeenCalled();
    expect(scheduleDraftMovePreviewRefresh).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Pick a valid move date.");
  });

  it("removes rename command when draft label matches baseline title", () => {
    const entry = buildEntry();
    const dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>();

    const { result } = renderHook(() =>
      usePlannerDraftEntryActions({
        context: buildContext(),
        entriesByDate: new Map([["2026-08-05", [entry]]]),
        previewUnitByEntryKey: new Map([[entry.key, buildPreviewUnit()]]),
        completionFactUnitsByGoalDate: new Map(),
        dispatchDraftCommand,
        scheduleDraftMovePreviewRefresh: vi.fn(),
      })
    );

    act(() => {
      result.current.updateDraftLabel(entry, "Goal 1");
    });

    expect(dispatchDraftCommand).toHaveBeenCalledWith({
      type: "remove_kind",
      scopeMonth: "2026-08",
      kind: "rename_item",
      goalId: "goal-1",
      unitKey: "unit-1",
    });
  });
});
