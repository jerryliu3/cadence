import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlannerDayEntry } from "@/features/planner/test-fixtures";
import { usePlannerMoveSessionDialog } from "@/features/planner/use-planner-move-session-dialog";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

describe("usePlannerMoveSessionDialog", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("routes submit to queueDraftMoveCommand and closes the dialog", () => {
    const entry = buildPlannerDayEntry({
      key: "goal-a:total:1",
      originalGoalId: "goal-a",
      unitKey: "total:1",
      label: "Goal A source",
    });
    const queueDraftMoveCommand = vi.fn(() => true);
    const closeMoveDialog = vi.fn();

    const { result } = renderHook(() =>
      usePlannerMoveSessionDialog({
        moveDialogDay: "2026-08-16",
        effectiveMoveDialogSourceEntryKey: "goal-a:total:1",
        moveDialogSourceOptions: [
          {
            entryKey: "goal-a:total:1",
            sourceDay: "2026-08-15",
            sourceLabel: "Goal A source",
            entry,
          },
        ],
        queueDraftMoveCommand,
        isValidIsoDate: () => true,
        closeMoveDialog,
      })
    );

    act(() => {
      result.current.submitMoveDialog();
    });

    expect(queueDraftMoveCommand).toHaveBeenCalledWith({
      entry,
      nextDate: "2026-08-16",
      source: "date_input",
    });
    expect(closeMoveDialog).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Move staged. Save plan to persist.");
  });

  it("blocks submit when source key is missing", () => {
    const queueDraftMoveCommand = vi.fn(() => true);

    const { result } = renderHook(() =>
      usePlannerMoveSessionDialog({
        moveDialogDay: "2026-08-16",
        effectiveMoveDialogSourceEntryKey: "",
        moveDialogSourceOptions: [],
        queueDraftMoveCommand,
        isValidIsoDate: () => true,
        closeMoveDialog: vi.fn(),
      })
    );

    act(() => {
      result.current.submitMoveDialog();
    });

    expect(queueDraftMoveCommand).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Select a scheduled date to move from.");
  });
});
