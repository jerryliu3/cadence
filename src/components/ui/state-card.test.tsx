import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StateCard } from "@/components/ui/state-card";

afterEach(() => {
  cleanup();
});

describe("StateCard", () => {
  it("renders the title and omits the description when not given", () => {
    render(<StateCard title="Nothing here" />);

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders the description when given", () => {
    render(<StateCard title="Nothing here" description="Try again later" />);

    expect(screen.getByText("Try again later")).toBeInTheDocument();
  });

  it("renders the icon when given", () => {
    render(<StateCard title="Nothing here" icon={<span data-testid="icon" />} />);

    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("uses inline layout by default", () => {
    const { container } = render(<StateCard title="Nothing here" />);

    expect(container.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
  });

  it("wraps content in a Card when layout is card", () => {
    const { container } = render(<StateCard title="Nothing here" layout="card" />);

    expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
  });

  it("applies the dashed border class in inline layout", () => {
    const { container } = render(<StateCard title="Nothing here" dashed />);

    expect(container.firstChild).toHaveClass("border-dashed");
  });

  it("applies compact text sizing to the title", () => {
    render(<StateCard title="Nothing here" compact />);

    expect(screen.getByText("Nothing here")).toHaveClass("text-sm");
  });

  it("merges a custom className onto the inline wrapper", () => {
    const { container } = render(<StateCard title="Nothing here" className="custom-class" />);

    expect(container.firstChild).toHaveClass("custom-class");
  });
});
