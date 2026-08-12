import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalRouteSheet } from "@/features/goals/goal-route-sheet";

describe("GoalRouteSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders sheet content", () => {
    render(
      <GoalRouteSheet onClose={vi.fn()} title="Create goal">
        <div>Goal sheet body</div>
      </GoalRouteSheet>
    );

    expect(screen.getByText("Goal sheet body")).toBeVisible();
  });

  it("closes when the close button is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <GoalRouteSheet onClose={onClose} title="Edit goal">
        <div>Goal sheet body</div>
      </GoalRouteSheet>
    );

    await user.click(screen.getByRole("button", { name: "Close goal editor" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
