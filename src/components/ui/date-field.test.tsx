import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateField } from "@/components/ui/date-field";

describe("DateField", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a visible native date picker", () => {
    render(
      <DateField
        value="2026-08-14"
        onValueChange={() => undefined}
        aria-label="Checklist date"
      />
    );

    const input = screen.getByLabelText("Checklist date");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveValue("2026-08-14");
    expect(input).not.toHaveClass("opacity-0");
  });

  it("forwards native picker changes", () => {
    const onValueChange = vi.fn();
    render(
      <DateField
        value="2026-08-14"
        onValueChange={onValueChange}
        aria-label="Checklist date"
      />
    );

    fireEvent.change(screen.getByLabelText("Checklist date"), {
      target: { value: "2026-08-15" },
    });
    expect(onValueChange).toHaveBeenCalledWith("2026-08-15");
  });
});
