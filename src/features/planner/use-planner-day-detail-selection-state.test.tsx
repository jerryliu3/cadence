import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePlannerDayDetailSelectionState } from "./use-planner-day-detail-selection-state";

describe("usePlannerDayDetailSelectionState", () => {
  it("tracks day-detail and event-detail selection lifecycle", () => {
    const { result } = renderHook(() => usePlannerDayDetailSelectionState());

    expect(result.current.dayDetailDay).toBeNull();
    expect(result.current.selectedEventEntryKey).toBeNull();

    act(() => {
      result.current.setDayDetailDay("2026-08-10");
    });
    expect(result.current.dayDetailDay).toBe("2026-08-10");
    expect(result.current.selectedEventEntryKey).toBeNull();

    act(() => {
      result.current.selectEventEntry("goal-1:unit-1");
    });
    expect(result.current.selectedEventEntryKey).toBe("goal-1:unit-1");

    act(() => {
      result.current.closeEventDetails();
    });
    expect(result.current.dayDetailDay).toBe("2026-08-10");
    expect(result.current.selectedEventEntryKey).toBeNull();

    act(() => {
      result.current.selectEventEntry("goal-2:unit-3");
      result.current.setDayDetailDay("2026-08-12");
    });
    expect(result.current.dayDetailDay).toBe("2026-08-12");
    expect(result.current.selectedEventEntryKey).toBeNull();

    act(() => {
      result.current.closeDayDetails();
    });
    expect(result.current.dayDetailDay).toBeNull();
    expect(result.current.selectedEventEntryKey).toBeNull();
  });
});
