// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChecklistShell } from "./checklist-shell";

let mockSearch = "?tab=calendar&view=week&month=2026-08";
let mockMobileViewport = false;

const calendarSurfaceMock = vi.fn((props: {
  activeTab: string;
  month: string | null;
  selectedDay: string | null;
  viewMode: string;
}) => (
  <div
    data-testid="calendar-surface"
    data-active-tab={props.activeTab}
    data-month={props.month ?? ""}
    data-day={props.selectedDay ?? ""}
    data-view-mode={props.viewMode}
  />
));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/features/planner/calendar-surface", () => ({
  CalendarSurface: (props: {
    activeTab: string;
    month: string | null;
    selectedDay: string | null;
    viewMode: string;
  }) => calendarSurfaceMock(props),
}));

vi.mock("@/features/today/checklist-surface", () => ({
  ChecklistSurface: () => <div data-testid="checklist-surface" />,
}));

describe("ChecklistShell calendar view normalization", () => {
  beforeEach(() => {
    mockSearch = "?tab=calendar&view=week&month=2026-08";
    mockMobileViewport = false;
    calendarSurfaceMock.mockClear();
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation(() => ({
        matches: mockMobileViewport,
        media: "(max-width: 767px)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      writable: true,
    });
  });
  afterEach(() => {
    cleanup();
  });

  it("passes through explicit calendar view mode from URL", () => {
    render(<ChecklistShell calendarEnabled />);

    const calendarSurface = screen.getByTestId("calendar-surface");
    expect(calendarSurface).toHaveAttribute("data-view-mode", "week");
    expect(calendarSurface).toHaveAttribute("data-month", "2026-08");
    expect(calendarSurface).toHaveAttribute("data-active-tab", "calendar");
  });

  it("coerces day deeplinks into calendar day mode", () => {
    mockSearch = "?day=2026-08-09";

    render(<ChecklistShell calendarEnabled />);

    const calendarSurface = screen.getByTestId("calendar-surface");
    expect(calendarSurface).toHaveAttribute("data-view-mode", "day");
    expect(calendarSurface).toHaveAttribute("data-day", "2026-08-09");
    expect(calendarSurface).toHaveAttribute("data-month", "2026-08");
    expect(calendarSurface).toHaveAttribute("data-active-tab", "calendar");
  });

  it("defaults to week view on mobile when view is missing", async () => {
    mockSearch = "?tab=calendar&month=2026-08";
    mockMobileViewport = true;

    render(<ChecklistShell calendarEnabled />);

    await waitFor(() => {
      const latestCall = calendarSurfaceMock.mock.calls.at(-1)?.[0];
      expect(latestCall?.viewMode).toBe("week");
      expect(latestCall?.month).toBe("2026-08");
    });
  });

  it("preserves calendar day and view across tab round-trips", async () => {
    mockSearch = "?tab=calendar&view=day&day=2026-08-20&month=2026-08";
    const user = userEvent.setup();
    const { rerender } = render(<ChecklistShell calendarEnabled />);
    const pushStateSpy = vi
      .spyOn(window.history, "pushState")
      .mockImplementation((_state, _unused, url) => {
        if (typeof url === "string") {
          const queryIndex = url.indexOf("?");
          mockSearch = queryIndex >= 0 ? url.slice(queryIndex) : "";
        }
      });

    await user.click(screen.getByRole("tab", { name: "Today" }));
    rerender(<ChecklistShell calendarEnabled />);
    await user.click(screen.getByRole("tab", { name: "Calendar" }));

    const finalUrl = pushStateSpy.mock.calls.at(-1)?.[2];
    expect(finalUrl).toContain("tab=calendar");
    expect(finalUrl).toContain("view=day");
    expect(finalUrl).toContain("day=2026-08-20");
    expect(finalUrl).toContain("month=2026-08");
  });
});
