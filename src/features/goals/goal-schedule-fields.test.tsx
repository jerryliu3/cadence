import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoalDateRangeFields,
  GoalDefaultTimeField,
} from "@/features/goals/goal-schedule-fields";

afterEach(() => {
  cleanup();
});

describe("GoalDateRangeFields", () => {
  it("renders start/end values and default labels", () => {
    render(
      <GoalDateRangeFields
        startDate="2026-08-01"
        endDate="2026-08-31"
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        requiresEndDate={false}
        startDateId="start"
        endDateId="end"
      />
    );

    expect(screen.getByLabelText("Start date")).toHaveValue("2026-08-01");
    expect(screen.getByLabelText("End date (optional)")).toHaveValue("2026-08-31");
  });

  it("marks end date required and relabels it when requiresEndDate is true", () => {
    render(
      <GoalDateRangeFields
        startDate=""
        endDate=""
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        requiresEndDate
        startDateId="start"
        endDateId="end"
      />
    );

    const endInput = screen.getByLabelText("End date");
    expect(endInput).toBeRequired();
    expect(screen.getByLabelText("Start date")).toBeRequired();
  });

  it("honors explicit label overrides", () => {
    render(
      <GoalDateRangeFields
        startDate=""
        endDate=""
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        requiresEndDate={false}
        startDateId="start"
        endDateId="end"
        startDateLabel="Begins"
        endDateLabel="Ends"
      />
    );

    expect(screen.getByLabelText("Begins")).toBeInTheDocument();
    expect(screen.getByLabelText("Ends")).toBeInTheDocument();
  });

  it("fires onStartDateChange and onEndDateChange with the new value", async () => {
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    const user = userEvent.setup();
    render(
      <GoalDateRangeFields
        startDate=""
        endDate=""
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        requiresEndDate={false}
        startDateId="start"
        endDateId="end"
      />
    );

    await user.type(screen.getByLabelText("Start date"), "2026-09-01");
    expect(onStartDateChange).toHaveBeenCalled();
    await user.type(screen.getByLabelText("End date (optional)"), "2026-09-30");
    expect(onEndDateChange).toHaveBeenCalled();
  });

  it("renders slot content next to each label", () => {
    render(
      <GoalDateRangeFields
        startDate=""
        endDate=""
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        requiresEndDate={false}
        startDateActions={<button type="button">Clear start</button>}
        endDateActions={<button type="button">Clear end</button>}
      />
    );

    expect(screen.getByRole("button", { name: "Clear start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear end" })).toBeInTheDocument();
  });
});

describe("GoalDefaultTimeField", () => {
  it("renders default label and helper text", () => {
    render(<GoalDefaultTimeField value="" onValueChange={vi.fn()} id="time" />);

    expect(screen.getByLabelText("Default time of day (optional)")).toBeInTheDocument();
    expect(
      screen.getByText(/used as the default planner time/i)
    ).toBeInTheDocument();
  });

  it("does not render a clear button when value is empty", () => {
    render(
      <GoalDefaultTimeField value="" onValueChange={vi.fn()} onClear={vi.fn()} id="time" />
    );

    expect(screen.queryByRole("button", { name: "clear" })).not.toBeInTheDocument();
  });

  it("renders a clear button when value is set and onClear is provided", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <GoalDefaultTimeField value="09:00" onValueChange={vi.fn()} onClear={onClear} id="time" />
    );

    const clearButton = screen.getByRole("button", { name: "clear" });
    await user.click(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("does not render a clear button when value is set but onClear is omitted", () => {
    render(<GoalDefaultTimeField value="09:00" onValueChange={vi.fn()} id="time" />);

    expect(screen.queryByRole("button", { name: "clear" })).not.toBeInTheDocument();
  });

  it("calls onValueChange with the new time value", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<GoalDefaultTimeField value="" onValueChange={onValueChange} id="time" />);

    await user.type(screen.getByLabelText("Default time of day (optional)"), "0900");
    expect(onValueChange).toHaveBeenCalled();
  });
});
