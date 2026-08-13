import { describe, expect, it } from "vitest";
import { normalizeCalendarState } from "@cadence/shared/planner/calendar-state";
import { normalizeChecklistShellRoute } from "@/lib/planner/calendar-route";

describe("normalizeChecklistShellRoute", () => {
  it("falls back to today for an invalid tab", () => {
    const result = normalizeChecklistShellRoute({
      searchParams: new URLSearchParams("tab=nope"),
      defaultCalendarViewMode: "month",
    });
    expect(result.tab).toBe("today");
    expect(result.changed).toBe(true);
    expect(result.nextParams.get("tab")).toBe("today");
  });

  it("promotes a valid day into calendar day view", () => {
    const result = normalizeChecklistShellRoute({
      searchParams: new URLSearchParams("day=2026-08-13"),
      defaultCalendarViewMode: "month",
    });
    expect(result).toMatchObject({
      tab: "calendar",
      month: "2026-08",
      day: "2026-08-13",
      viewMode: "day",
      changed: true,
    });
  });

  it("does not promote a valid day when the today tab is explicit", () => {
    const result = normalizeChecklistShellRoute({
      searchParams: new URLSearchParams("tab=today&day=2026-08-13"),
      defaultCalendarViewMode: "month",
    });
    expect(result.tab).toBe("today");
    expect(result.day).toBe("2026-08-13");
    expect(result.changed).toBe(false);
  });

  it("drops an invalid day instead of keeping it", () => {
    const result = normalizeChecklistShellRoute({
      searchParams: new URLSearchParams("tab=today&day=2026-13-40"),
      defaultCalendarViewMode: "month",
    });
    expect(result.day).toBeNull();
    expect(result.nextParams.has("day")).toBe(false);
  });

  it("clears day in month view on the calendar tab", () => {
    const result = normalizeChecklistShellRoute({
      searchParams: new URLSearchParams(
        "tab=calendar&view=month&month=2026-08&day=2026-08-13"
      ),
      defaultCalendarViewMode: "month",
    });
    expect(result.viewMode).toBe("month");
    expect(result.day).toBeNull();
    expect(result.month).toBe("2026-08");
  });
});

describe("normalizeCalendarState", () => {
  it("fills a day for week view on the calendar surface", () => {
    const result = normalizeCalendarState({
      month: "2026-08",
      viewMode: "week",
      defaultCalendarViewMode: "month",
      surface: "calendar",
    });
    expect(result.day).toBe("2026-08-01");
    expect(result.viewMode).toBe("week");
    expect(result.month).toBe("2026-08");
  });

  it("keeps an explicit today tab with a valid day", () => {
    const result = normalizeCalendarState({
      tab: "today",
      day: "2026-08-13",
      defaultCalendarViewMode: "month",
      surface: "checklist-shell",
    });
    expect(result.tab).toBe("today");
    expect(result.day).toBe("2026-08-13");
    expect(result.viewMode).toBe("month");
  });
});
