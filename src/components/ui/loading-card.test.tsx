import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingCard } from "@/components/ui/loading-card";

afterEach(() => {
  cleanup();
});

describe("LoadingCard", () => {
  it("renders the title inside a card layout", () => {
    const { container } = render(<LoadingCard title="Loading goals" />);

    expect(screen.getByText("Loading goals")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
  });

  it("renders the description when given", () => {
    render(<LoadingCard title="Loading goals" description="Hang tight" />);

    expect(screen.getByText("Hang tight")).toBeInTheDocument();
  });

  it("omits the description when not given", () => {
    render(<LoadingCard title="Loading goals" />);

    expect(screen.queryByText(/hang tight/i)).not.toBeInTheDocument();
  });
});
