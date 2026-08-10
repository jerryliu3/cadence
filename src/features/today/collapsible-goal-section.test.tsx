import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollapsibleGoalSection } from "@/features/today/collapsible-goal-section";

afterEach(() => {
  cleanup();
});

describe("CollapsibleGoalSection", () => {
  it("renders the title, count badge, and icon", () => {
    render(
      <CollapsibleGoalSection
        open
        onOpenChange={vi.fn()}
        title="Active goals"
        count={3}
        icon={<span data-testid="icon" />}
        emptyMessage="Nothing here"
      >
        <div>goal item</div>
      </CollapsibleGoalSection>
    );

    expect(screen.getByText("Active goals")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders children when count is greater than zero and open", () => {
    render(
      <CollapsibleGoalSection
        open
        onOpenChange={vi.fn()}
        title="Active goals"
        count={1}
        icon={null}
        emptyMessage="Nothing here"
      >
        <div>goal item</div>
      </CollapsibleGoalSection>
    );

    expect(screen.getByText("goal item")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here")).not.toBeInTheDocument();
  });

  it("renders the empty message instead of children when count is zero", () => {
    render(
      <CollapsibleGoalSection
        open
        onOpenChange={vi.fn()}
        title="Active goals"
        count={0}
        icon={null}
        emptyMessage="Nothing here"
      >
        <div>goal item</div>
      </CollapsibleGoalSection>
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByText("goal item")).not.toBeInTheDocument();
  });

  it("hides content when closed", () => {
    render(
      <CollapsibleGoalSection
        open={false}
        onOpenChange={vi.fn()}
        title="Active goals"
        count={1}
        icon={null}
        emptyMessage="Nothing here"
      >
        <div>goal item</div>
      </CollapsibleGoalSection>
    );

    expect(screen.queryByText("goal item")).not.toBeInTheDocument();
  });

  it("calls onOpenChange when the trigger is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CollapsibleGoalSection
        open
        onOpenChange={onOpenChange}
        title="Active goals"
        count={1}
        icon={null}
        emptyMessage="Nothing here"
      >
        <div>goal item</div>
      </CollapsibleGoalSection>
    );

    await user.click(screen.getByRole("button"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
