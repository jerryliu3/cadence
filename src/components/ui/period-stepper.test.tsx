import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeriodStepper } from "@/components/ui/period-stepper";

afterEach(() => {
  cleanup();
});

describe("PeriodStepper", () => {
  it("renders the center content between the navigation buttons", () => {
    render(<PeriodStepper center={<span>August 2026</span>} />);

    expect(screen.getByText("August 2026")).toBeInTheDocument();
  });

  it("uses default aria-labels when none are given", () => {
    render(<PeriodStepper center={<span>content</span>} />);

    expect(screen.getByRole("button", { name: "Previous period" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next period" })).toBeInTheDocument();
  });

  it("uses custom aria-labels when given", () => {
    render(
      <PeriodStepper
        center={<span>content</span>}
        previousAriaLabel="Previous month"
        nextAriaLabel="Next month"
      />
    );

    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
  });

  it("calls onPrevious and onNext when clicked", async () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(<PeriodStepper center={<span>content</span>} onPrevious={onPrevious} onNext={onNext} />);

    await user.click(screen.getByRole("button", { name: "Previous period" }));
    expect(onPrevious).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Next period" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("disables navigation buttons when no handler is provided", () => {
    render(<PeriodStepper center={<span>content</span>} />);

    expect(screen.getByRole("button", { name: "Previous period" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next period" })).toBeDisabled();
  });

  it("disables navigation buttons when explicitly marked disabled, even with a handler", () => {
    render(
      <PeriodStepper
        center={<span>content</span>}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        previousDisabled
        nextDisabled
      />
    );

    expect(screen.getByRole("button", { name: "Previous period" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next period" })).toBeDisabled();
  });
});
