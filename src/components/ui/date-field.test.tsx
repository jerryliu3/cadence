import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateField } from "@/components/ui/date-field";

describe("DateField", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the weekday inside the field because native date inputs cannot format it", () => {
    render(<DateField value="2026-08-14" onValueChange={() => undefined} />);

    expect(screen.getByText("Fri, Aug 14, 2026")).toBeInTheDocument();
    expect(screen.getByLabelText("Fri, Aug 14, 2026")).toHaveAttribute("type", "date");
  });

  it("forwards native picker changes", () => {
    const onValueChange = vi.fn();
    render(<DateField value="2026-08-14" onValueChange={onValueChange} />);

    fireEvent.change(screen.getByLabelText("Fri, Aug 14, 2026"), {
      target: { value: "2026-08-15" },
    });
    expect(onValueChange).toHaveBeenCalledWith("2026-08-15");
  });
});
