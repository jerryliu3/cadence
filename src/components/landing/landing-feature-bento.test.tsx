import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingFeatureBento } from "@/components/landing/landing-feature-bento";

describe("LandingFeatureBento", () => {
  it("shows reviewed coach proposals and recovery without overstating behavior", () => {
    render(<LandingFeatureBento />);

    expect(screen.getByText("AI Coach")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Review proposal")).toBeInTheDocument();
    expect(screen.getByText("Recover your rhythm")).toBeInTheDocument();
    expect(
      screen.getByText(
        /A disrupted day does not ruin the plan. Automatically adjust unfinished sessions into dates that still work./
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/A disrupted week/)).not.toBeInTheDocument();
    expect(screen.getByText("2 sessions re-placed")).toBeInTheDocument();
    expect(screen.queryByText(/autonomous/i)).not.toBeInTheDocument();
  });
});
