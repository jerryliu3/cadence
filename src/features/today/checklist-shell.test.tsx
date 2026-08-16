import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChecklistShell } from "./checklist-shell";

let mockSearch = "?tab=today";
const checklistSurfaceMock = vi.fn(
  () => <div data-testid="checklist-surface" />
);

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/lib/social/duo/telemetry", () => ({
  reportDuoTelemetry: vi.fn(),
}));

vi.mock("@/features/today/checklist-surface", () => ({
  ChecklistSurface: () => checklistSurfaceMock(),
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

  it("renders one checklist surface without separate today and past tabs", () => {
    render(<ChecklistShell />);

    expect(screen.getByTestId("checklist-surface")).toBeInTheDocument();
    expect(checklistSurfaceMock).toHaveBeenCalledTimes(1);
  });

  it("ignores legacy past tab aliases without rewriting the URL", () => {
    mockSearch = "?tab=past";
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    render(<ChecklistShell />);

    expect(screen.getByTestId("checklist-surface")).toBeInTheDocument();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});
