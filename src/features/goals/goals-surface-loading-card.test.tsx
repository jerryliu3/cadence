import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GoalsSurfaceLoadingCard } from "@/features/goals/goals-surface-loading-card";

afterEach(() => {
  cleanup();
});

describe("GoalsSurfaceLoadingCard", () => {
  it("renders the given title and description", () => {
    render(
      <GoalsSurfaceLoadingCard title="Loading goals" description="Hang tight" />
    );

    expect(screen.getByText("Loading goals")).toBeInTheDocument();
    expect(screen.getByText("Hang tight")).toBeInTheDocument();
  });
});
