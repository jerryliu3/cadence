import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChecklistShell } from "./checklist-shell";

let mockSearch = "?tab=today";
const checklistSurfaceMock = vi.fn(
  (_props?: unknown) => <div data-testid="checklist-surface" />
);
const useDuoSurfaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/lib/social/duo/telemetry", () => ({
  reportDuoTelemetry: vi.fn(),
}));

vi.mock("@/features/social/duo/use-duo-surface", () => ({
  useDuoSurface: (...args: unknown[]) => useDuoSurfaceMock(...args),
}));

vi.mock("@/features/today/checklist-surface", () => ({
  ChecklistSurface: (props: unknown) => checklistSurfaceMock(props),
}));

describe("ChecklistShell", () => {
  beforeEach(() => {
    mockSearch = "?tab=today";
    checklistSurfaceMock.mockClear();
    useDuoSurfaceMock.mockReset();
    useDuoSurfaceMock.mockReturnValue({
      scope: "me",
      activePartner: null,
      viewer: { id: "viewer", label: "Solo", readOnly: false },
      partner: null,
    });
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
    expect(checklistSurfaceMock.mock.calls[0]?.[0]).toMatchObject({
      readOnly: false,
    });
  });

  it("ignores legacy past tab aliases without rewriting the URL", () => {
    mockSearch = "?tab=past";
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    render(<ChecklistShell />);

    expect(screen.getByTestId("checklist-surface")).toBeInTheDocument();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it("shows checklist filters only on the main lane in duo both scope", () => {
    useDuoSurfaceMock.mockReturnValue({
      scope: "both",
      activePartner: {
        partnerId: "partner-1",
        partnerUsername: "partner",
        partnerDisplayName: "Partner",
      },
      viewer: { id: "viewer", label: "Solo", readOnly: false },
      partner: {
        id: "partner",
        label: "Partner",
        userId: "partner-1",
        readOnly: true,
      },
    });

    render(<ChecklistShell />);

    expect(checklistSurfaceMock).toHaveBeenCalledTimes(3);
    expect(checklistSurfaceMock.mock.calls[0]?.[0]).toMatchObject({
      contentMode: "filters-only",
    });
    expect(checklistSurfaceMock.mock.calls[1]?.[0]).toMatchObject({
      contentMode: "goals-only",
      showFiltersSection: false,
      readOnly: false,
    });
    expect(checklistSurfaceMock.mock.calls[2]?.[0]).toMatchObject({
      contentMode: "goals-only",
      showFiltersSection: false,
      readOnly: true,
      subjectUserId: "partner-1",
    });
  });
});
