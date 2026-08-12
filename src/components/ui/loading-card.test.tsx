import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingCard } from "@/components/ui/loading-card";

describe("LoadingCard", () => {
  it("renders a skeleton placeholder while exposing accessible copy", () => {
    render(
      <LoadingCard
        title="Loading checklist..."
        description="Fetching your goals and completions."
      />
    );

    expect(screen.getByTestId("loading-card-skeleton")).toBeInTheDocument();
    expect(screen.getByText("Loading checklist...")).toHaveClass("sr-only");
    expect(screen.getByText("Fetching your goals and completions.")).toHaveClass(
      "sr-only"
    );
  });
});
