import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayTab } from "@/features/today/today-tab";

const plannerTasksPanelMock = vi.fn(
  (_props?: unknown) => <div data-testid="planner-tasks-panel" />
);

vi.mock("@/features/today/use-checklist-data", () => ({
  useChecklistData: () => ({
    data: {
      completions: [],
      progress: null,
      goals: [],
      userId: "viewer-user",
      memberTeamIds: [],
      links: [],
      photoUrls: {},
    },
    loading: false,
    laneError: null,
    loadData: vi.fn(),
    redirectToLogin: vi.fn(),
    todayLocalDate: "2026-08-14",
  }),
}));

vi.mock("@/features/tasks/planner-tasks-panel", () => ({
  PlannerTasksPanel: (props: unknown) => plannerTasksPanelMock(props),
}));

describe("TodayTab task panel wiring", () => {
  beforeEach(() => {
    plannerTasksPanelMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("disables task creation controls for checklist day tasks", () => {
    render(<TodayTab />);

    expect(screen.getByTestId("planner-tasks-panel")).toBeInTheDocument();
    expect(plannerTasksPanelMock).toHaveBeenCalledTimes(1);
    expect(plannerTasksPanelMock.mock.calls[0]?.[0]).toMatchObject({
      title: "Tasks for this day",
      allowCreate: false,
    });
  });
});
