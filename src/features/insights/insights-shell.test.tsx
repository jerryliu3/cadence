import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsightsShell } from "./insights-shell";

const useDuoSurfaceMock = vi.fn();
const insightsTabMock = vi.fn((props: unknown) => (
  <div
    data-testid={`insights-tab-${String(
      (props as { contentMode?: string }).contentMode ?? "full"
    )}`}
  />
));

vi.mock("@/features/social/duo/use-duo-surface", () => ({
  useDuoSurface: (...args: unknown[]) => useDuoSurfaceMock(...args),
}));

vi.mock("@/features/insights/insights-tab", () => ({
  InsightsTab: (props: unknown) => insightsTabMock(props),
}));

describe("InsightsShell", () => {
  beforeEach(() => {
    insightsTabMock.mockClear();
    useDuoSurfaceMock.mockReset();
    useDuoSurfaceMock.mockReturnValue({
      scope: "me",
      activePartner: null,
      viewer: { id: "viewer", label: "Solo", readOnly: false },
      partner: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders one full insights lane outside duo-both scope", () => {
    render(<InsightsShell />);

    expect(screen.getByTestId("insights-tab-full")).toBeInTheDocument();
    expect(insightsTabMock).toHaveBeenCalledTimes(1);
    expect(insightsTabMock.mock.calls[0]?.[0]).toMatchObject({
      readOnly: false,
    });
  });

  it("renders split duo-both layout with one shared goal stats section", () => {
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

    render(<InsightsShell />);

    expect(insightsTabMock).toHaveBeenCalledTimes(5);
    expect(screen.getByTestId("insights-tab-goal-stats-only")).toBeInTheDocument();

    const modes = insightsTabMock.mock.calls.map(
      (call) => (call[0] as { contentMode?: string }).contentMode
    );
    expect(modes.filter((mode) => mode === "overall-only")).toHaveLength(2);
    expect(modes.filter((mode) => mode === "goals-only")).toHaveLength(2);
    expect(modes.filter((mode) => mode === "goal-stats-only")).toHaveLength(1);
  });
});
