import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MilestoneNameFields } from "@/features/goals/milestone-name-fields";

afterEach(() => {
  cleanup();
});

describe("MilestoneNameFields", () => {
  it("renders one input per count with default-name placeholders", () => {
    render(<MilestoneNameFields count={3} values={[]} onValueChange={vi.fn()} />);

    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toHaveAttribute("placeholder", "Milestone 1");
    expect(inputs[2]).toHaveAttribute("placeholder", "Milestone 3");
  });

  it("populates existing values", () => {
    render(
      <MilestoneNameFields count={2} values={["5k run"]} onValueChange={vi.fn()} />
    );

    const inputs = screen.getAllByRole("textbox");
    expect(inputs[0]).toHaveValue("5k run");
    expect(inputs[1]).toHaveValue("");
  });

  it("shows the label by default and hides it when showLabel is false", () => {
    const { rerender } = render(
      <MilestoneNameFields count={1} values={[]} onValueChange={vi.fn()} />
    );
    expect(screen.getByText("Milestone names (optional)")).toBeInTheDocument();

    rerender(
      <MilestoneNameFields
        count={1}
        values={[]}
        onValueChange={vi.fn()}
        showLabel={false}
      />
    );
    expect(screen.queryByText("Milestone names (optional)")).not.toBeInTheDocument();
  });

  it("uses a custom label when provided", () => {
    render(
      <MilestoneNameFields
        count={1}
        values={[]}
        onValueChange={vi.fn()}
        label="Step names"
      />
    );
    expect(screen.getByText("Step names")).toBeInTheDocument();
  });

  it("calls onValueChange with the field index and new value", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MilestoneNameFields count={2} values={["", ""]} onValueChange={onValueChange} />
    );

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[1], "X");
    expect(onValueChange).toHaveBeenCalledWith(1, "X");
  });

  it("renders the blank-field helper text", () => {
    render(<MilestoneNameFields count={1} values={[]} onValueChange={vi.fn()} />);
    expect(
      screen.getByText("Leave any field blank to use the default name.")
    ).toBeInTheDocument();
  });
});
