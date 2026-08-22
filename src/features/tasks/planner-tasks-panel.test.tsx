import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerTasksPanel } from "@/features/tasks/planner-tasks-panel";

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: rpcMock,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("PlannerTasksPanel", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("hides the panel when configured and no tasks are scheduled", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    render(
      <PlannerTasksPanel
        title="Tasks"
        description={null}
        scheduledDate="2026-08-22"
        allowCreate={false}
        hideWhenEmpty
      />
    );

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("list_planner_tasks", {
        p_for_date: "2026-08-22",
      });
    });
    await waitFor(() => {
      expect(screen.queryByText("Tasks")).toBeNull();
    });
  });

  it("shows tasks without rendering a subtitle when description is omitted", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          task_id: "task-1",
          title: "Ship release notes",
          scheduled_date: "2026-08-22",
          completed_at: null,
          created_at: "2026-08-21T12:00:00.000Z",
          updated_at: "2026-08-21T12:00:00.000Z",
        },
      ],
      error: null,
    });

    render(
      <PlannerTasksPanel
        title="Tasks"
        description={null}
        scheduledDate="2026-08-22"
        allowCreate={false}
        hideWhenEmpty
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Tasks")).toBeInTheDocument();
      expect(screen.getByText("Ship release notes")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("Track simple one-time tasks separately from recurring goals.")
    ).toBeNull();
  });
});
