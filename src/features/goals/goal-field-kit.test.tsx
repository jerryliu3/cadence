import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CategorySelect,
  GoalTypeToggle,
  RecurrenceIntervalToggle,
  TargetCountField,
} from "@/features/goals/goal-field-kit";

afterEach(() => {
  cleanup();
});

describe("CategorySelect", () => {
  it("shows the current selection and default placeholder", () => {
    render(<CategorySelect value="health" onValueChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Health");
  });

  it("calls onValueChange with the selected preset id", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<CategorySelect value="health" onValueChange={onValueChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Relationships" }));

    expect(onValueChange).toHaveBeenCalledWith("relationships");
  });

  it("lists all category presets plus a custom option", async () => {
    const user = userEvent.setup();
    render(<CategorySelect value="health" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "Personal" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Relationships" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Health" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Custom" })).toBeInTheDocument();
  });
});

describe("GoalTypeToggle", () => {
  it("renders the selected goal type and lists all options when opened", async () => {
    const user = userEvent.setup();
    render(<GoalTypeToggle value="recurring" onValueChange={vi.fn()} />);

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Repeated");

    await user.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "Repeated" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Milestones" })).toBeInTheDocument();
  });

  it("calls onValueChange with the clicked option's value", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<GoalTypeToggle value="recurring" onValueChange={onValueChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Milestones" }));
    expect(onValueChange).toHaveBeenCalledWith("fixed_milestones");
  });
});

describe("RecurrenceIntervalToggle", () => {
  it("renders the selected interval and lists all recurrence options when opened", async () => {
    const user = userEvent.setup();
    render(<RecurrenceIntervalToggle value="daily" onValueChange={vi.fn()} />);

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Daily");

    await user.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "Daily" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Weekly" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Monthly" })).toBeInTheDocument();
  });

  it("calls onValueChange with the clicked option's value", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<RecurrenceIntervalToggle value="daily" onValueChange={onValueChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Weekly" }));
    expect(onValueChange).toHaveBeenCalledWith("weekly");
  });
});

describe("TargetCountField", () => {
  it("is optional for recurring goals and shows the target-total helper text", () => {
    render(
      <TargetCountField frequencyType="recurring" value="" onValueChange={vi.fn()} />
    );

    const input = screen.getByRole("spinbutton");
    expect(input).not.toBeRequired();
    expect(input).toHaveAttribute("min", "0");
    expect(
      screen.getByText(/each date is checked independently/i)
    ).toBeInTheDocument();
  });

  it("is required for fixed-milestone goals and hides the helper text", () => {
    render(
      <TargetCountField
        frequencyType="fixed_milestones"
        value="3"
        onValueChange={vi.fn()}
      />
    );

    const input = screen.getByRole("spinbutton");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("min", "1");
    expect(
      screen.queryByText(/each date is checked independently/i)
    ).not.toBeInTheDocument();
  });

  it("calls onValueChange with the raw input value", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TargetCountField frequencyType="fixed_milestones" value="" onValueChange={onValueChange} />
    );

    await user.type(screen.getByRole("spinbutton"), "5");
    expect(onValueChange).toHaveBeenLastCalledWith("5");
  });

  it("wires the id prop to the input for label association", () => {
    render(
      <TargetCountField
        id="target-count"
        frequencyType="recurring"
        value=""
        onValueChange={vi.fn()}
      />
    );

    expect(screen.getByRole("spinbutton")).toHaveAttribute("id", "target-count");
  });
});
