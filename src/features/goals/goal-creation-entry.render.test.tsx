import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalCreationEntry } from "@/features/goals/goal-creation-entry";

let mockSearch = "";

vi.mock("next/navigation", () => ({
  usePathname: () => "/goals/new",
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/features/today/goal-form", () => ({
  GoalForm: () => <div>single-mode-form</div>,
}));

vi.mock("@/features/today/bulk-goal-form", () => ({
  BulkGoalForm: () => <div>multi-mode-form</div>,
}));

vi.mock("@/features/goals/training-plan-import-entry", () => ({
  TrainingPlanImportEntry: () => <div>training-mode-form</div>,
}));

describe("GoalCreationEntry rendering", () => {
  afterEach(() => {
    cleanup();
    mockSearch = "";
  });

  it("opens multi mode when a starter pack is present", () => {
    mockSearch = "starterPack=health";
    render(<GoalCreationEntry />);

    expect(screen.getByText("Starter packs (optional)")).toBeInTheDocument();
    expect(screen.getByText("multi-mode-form")).toBeInTheDocument();
  });

  it("shows and dismisses onboarding intro hint", () => {
    mockSearch = "onboarding=intro";
    render(<GoalCreationEntry />);

    expect(
      screen.getByText("Onboarding: create your first real goal")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dismiss onboarding hint" })).toHaveAttribute(
      "href",
      "/goals/new"
    );
  });
});
