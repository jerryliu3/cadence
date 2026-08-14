"use client";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalNewSheetEntry } from "@/features/goals/goal-new-sheet-entry";

const routerMock = vi.hoisted(() => ({
  back: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

let mockSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/features/goals/goal-route-sheet", () => ({
  GoalRouteSheet: ({
    children,
    onClose,
  }: {
    children: React.ReactNode;
    onClose: () => void;
  }) => (
    <div>
      <button type="button" onClick={onClose}>
        Dismiss
      </button>
      {children}
    </div>
  ),
}));

vi.mock("@/features/goals/goal-creation-entry", () => ({
  GoalCreationEntry: ({ onExit }: { onExit?: () => void }) => (
    <button type="button" onClick={onExit}>
      Save goal
    </button>
  ),
}));

describe("GoalNewSheetEntry", () => {
  afterEach(() => {
    cleanup();
    mockSearch = "";
    routerMock.back.mockReset();
    routerMock.refresh.mockReset();
    routerMock.replace.mockReset();
  });

  it("returns to the route from returnTo when save completes", async () => {
    mockSearch = "returnTo=%2Fsocial%3Ftab%3Dchallenges";
    const user = userEvent.setup();

    render(<GoalNewSheetEntry />);
    await user.click(screen.getByRole("button", { name: "Save goal" }));

    expect(routerMock.replace).toHaveBeenCalledWith("/social?tab=challenges");
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.back).not.toHaveBeenCalled();
  });

  it("falls back to back+refresh when returnTo is absent", async () => {
    const user = userEvent.setup();

    render(<GoalNewSheetEntry />);
    await user.click(screen.getByRole("button", { name: "Save goal" }));

    expect(routerMock.back).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("dismisses to returnTo when present", async () => {
    mockSearch = "returnTo=%2Fcalendar";
    const user = userEvent.setup();

    render(<GoalNewSheetEntry />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(routerMock.replace).toHaveBeenCalledWith("/calendar");
    expect(routerMock.back).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
