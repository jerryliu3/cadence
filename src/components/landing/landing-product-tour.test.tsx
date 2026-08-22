import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingProductTour } from "@/components/landing/landing-product-tour";

describe("LandingProductTour", () => {
  it("shows the real execution, insight, community, and preference workflows", () => {
    render(<LandingProductTour />);

    expect(
      screen.getByRole("heading", { name: "Built for the full loop" })
    ).toBeInTheDocument();
    expect(screen.getByText("Execute your way")).toBeInTheDocument();
    expect(screen.getByText("See your patterns")).toBeInTheDocument();
    expect(screen.getByText("Progress together")).toBeInTheDocument();
    expect(screen.getByText("Make it yours")).toBeInTheDocument();
    expect(screen.getByText("Edit history")).toBeInTheDocument();
    expect(screen.getByText("Season leaderboard")).toBeInTheDocument();
    expect(screen.queryByText(/community chat/i)).not.toBeInTheDocument();
  });
});
