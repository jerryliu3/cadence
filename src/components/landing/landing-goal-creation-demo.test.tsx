import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  creationDemoDrafts,
  creationDemoPrompt,
  LandingGoalCreationDemo,
  nextCreationDemoPhase,
  type CreationDemoPhase,
} from "@/components/landing/landing-goal-creation-demo";

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

afterEach(cleanup);

describe("nextCreationDemoPhase", () => {
  it("types, reveals drafts, clicks create, then confirms", () => {
    const phases: CreationDemoPhase[] = [];
    let phase: CreationDemoPhase = "typing";

    for (let index = 0; index < 6; index += 1) {
      phase = nextCreationDemoPhase(phase, false);
      phases.push(phase);
    }

    expect(phases).toEqual([
      "parsing",
      "drafts",
      "clicking-create",
      "creating",
      "created",
      "typing",
    ]);
  });

  it("holds the confirmed plan with reduced motion", () => {
    expect(nextCreationDemoPhase("typing", true)).toBe("created");
  });
});

describe("LandingGoalCreationDemo", () => {
  it("shows a seeded prompt, drafts, and a create confirmation", () => {
    render(<LandingGoalCreationDemo />);

    expect(screen.getByTestId("goal-creation-demo")).toBeInTheDocument();
    const natural = screen.getByTestId("goal-creation-natural");
    expect(natural).toBeVisible();
    expect(screen.getByText(creationDemoPrompt)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    for (const draft of creationDemoDrafts) {
      expect(within(natural).getByText(draft.title)).toBeInTheDocument();
    }
    expect(screen.getByText("Create multiple goals")).toBeInTheDocument();
    expect(screen.getAllByText("4 goals created")).toHaveLength(2);
  });

  it("lets visitors preview Manual configuration and Natural language", async () => {
    const user = userEvent.setup();
    render(<LandingGoalCreationDemo />);

    expect(screen.getByTestId("goal-creation-natural")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Manual" }));
    expect(screen.getByTestId("goal-creation-manual")).toBeVisible();
    expect(screen.getByTestId("goal-creation-natural")).not.toBeVisible();
    expect(
      within(screen.getByTestId("goal-creation-manual")).getByText("Easy run")
    ).toBeVisible();
    expect(screen.getByText("Create goal")).toBeVisible();
    expect(screen.getByText("Repeated")).toBeVisible();
    expect(
      within(screen.getByTestId("goal-creation-manual")).getByText("Weekly")
    ).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Natural language" }));
    expect(screen.getByTestId("goal-creation-natural")).toBeVisible();
  });
});
