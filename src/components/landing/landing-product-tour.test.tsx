import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LandingProductTour } from "@/components/landing/landing-product-tour";

afterEach(cleanup);

describe("LandingProductTour", () => {
  it("shows the real execution, insight, community, and preference workflows", () => {
    render(<LandingProductTour />);

    expect(
      screen.getByRole("heading", { name: "Built for the full loop" })
    ).toBeInTheDocument();
    expect(screen.getByText("Start in one sentence")).toBeInTheDocument();
    expect(screen.getByText("Execute your way")).toBeInTheDocument();
    expect(screen.getByText("See your patterns")).toBeInTheDocument();
    expect(screen.getByText("Progress together")).toBeInTheDocument();
    expect(screen.getByText("Make it yours")).toBeInTheDocument();
    expect(screen.getByTestId("planner-surface-checklist")).toHaveTextContent(
      "Monthly"
    );
    expect(screen.getByText("Edit history")).toBeInTheDocument();
    expect(screen.getByText("Aug 10 selected")).toBeInTheDocument();
    expect(screen.getByText("80% · 12/15 completions")).toBeInTheDocument();
    expect(screen.queryByText("7 day streak")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Easily edit past completion when needed so nothing is missed/)
    ).toBeInTheDocument();
    expect(screen.getByText("Season leaderboard")).toBeInTheDocument();
    expect(screen.getAllByTestId("heatmap-cell").length).toBeGreaterThan(50);
    expect(screen.getByTestId("insights-heatmap")).toHaveClass("w-full");
    expect(
      screen.queryByText(/every daily task links back/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/community chat/i)).not.toBeInTheDocument();
  });

  it("lets visitors preview Calendar, Checklist, and Tasks outlines", async () => {
    const user = userEvent.setup();
    render(<LandingProductTour />);

    expect(screen.getByTestId("planner-surface-checklist")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Calendar" }));
    expect(screen.getByTestId("planner-surface-calendar")).toBeVisible();
    expect(screen.getByTestId("planner-surface-checklist")).not.toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(screen.getByTestId("planner-surface-tasks")).toBeVisible();
    expect(screen.getByText("Buy race nutrition")).toBeVisible();
    expect(
      screen.getByText("One-time tasks stay separate from recurring goals.")
    ).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Checklist" }));
    expect(screen.getByTestId("planner-surface-checklist")).toBeVisible();
  });
});
