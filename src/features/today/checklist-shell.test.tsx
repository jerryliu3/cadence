import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChecklistShell } from "./checklist-shell";

let mockSearch = "?tab=today";
const checklistSurfaceMock = vi.fn(
  (props: { activeTab: "today" | "not-today"; onActiveTabChange: (tab: "today" | "not-today") => void }) => (
    <div data-testid="checklist-surface" data-active-tab={props.activeTab}>
      <button type="button" onClick={() => props.onActiveTabChange("today")}>
        Switch Today
      </button>
      <button type="button" onClick={() => props.onActiveTabChange("not-today")}>
        Switch Past
      </button>
    </div>
  )
);

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/features/today/checklist-surface", () => ({
  ChecklistSurface: (props: {
    activeTab: "today" | "not-today";
    onActiveTabChange: (tab: "today" | "not-today") => void;
  }) => checklistSurfaceMock(props),
}));

describe("ChecklistShell", () => {
  beforeEach(() => {
    mockSearch = "?tab=today";
    checklistSurfaceMock.mockClear();
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
    });
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the Today surface by default", () => {
    render(<ChecklistShell />);

    expect(screen.getByTestId("checklist-surface")).toHaveAttribute(
      "data-active-tab",
      "today"
    );
  });

  it("normalizes legacy past tab aliases", () => {
    mockSearch = "?tab=past";
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    render(<ChecklistShell />);

    expect(screen.getByTestId("checklist-surface")).toHaveAttribute(
      "data-active-tab",
      "not-today"
    );
    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it("pushes tab changes into URL history", async () => {
    const user = userEvent.setup();
    render(<ChecklistShell />);
    const pushStateSpy = vi
      .spyOn(window.history, "pushState")
      .mockImplementation((_state, _unused, url) => {
        if (typeof url === "string") {
          const queryIndex = url.indexOf("?");
          mockSearch = queryIndex >= 0 ? url.slice(queryIndex) : "";
        }
      });

    await user.click(screen.getByRole("button", { name: "Switch Past" }));

    const finalUrl = pushStateSpy.mock.calls.at(-1)?.[2];
    expect(finalUrl).toContain("tab=not-today");
  });
});
