import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedByMeCard } from "@/features/social/shared-by-me-card";
import { buildGoal, buildGoalShare, buildProfile } from "@/lib/goals/goal-test-fixtures";

afterEach(() => {
  cleanup();
});

describe("SharedByMeCard", () => {
  it("shows an empty state when no goals have been shared", () => {
    render(
      <SharedByMeCard
        sharedByMeGoals={[]}
        outgoingSharesByGoal={new Map()}
        profileDirectory={{}}
        onRevokeGoalShare={vi.fn()}
      />
    );

    expect(screen.getByText("You have not shared any goals yet.")).toBeInTheDocument();
  });

  it("renders a shared goal with its recipient count", () => {
    const goal = buildGoal({ id: "goal-1", title: "Run 5k" });
    const shares = [buildGoalShare({ id: "s1", goal_id: "goal-1", shared_with: "user-2" })];

    render(
      <SharedByMeCard
        sharedByMeGoals={[goal]}
        outgoingSharesByGoal={new Map([["goal-1", shares]])}
        profileDirectory={{ "user-2": buildProfile({ id: "user-2", username: "alex" }) }}
        onRevokeGoalShare={vi.fn()}
      />
    );

    expect(screen.getByText("Run 5k")).toBeInTheDocument();
    expect(screen.getByText("Shared with 1 person")).toBeInTheDocument();
    expect(screen.getByText("@alex")).toBeInTheDocument();
  });

  it("uses plural copy when shared with more than one person", () => {
    const goal = buildGoal({ id: "goal-1" });
    const shares = [
      buildGoalShare({ id: "s1", shared_with: "user-2" }),
      buildGoalShare({ id: "s2", shared_with: "user-3" }),
    ];

    render(
      <SharedByMeCard
        sharedByMeGoals={[goal]}
        outgoingSharesByGoal={new Map([["goal-1", shares]])}
        profileDirectory={{}}
        onRevokeGoalShare={vi.fn()}
      />
    );

    expect(screen.getByText("Shared with 2 people")).toBeInTheDocument();
  });

  it("shows a no-active-recipients message when a goal has zero shares", () => {
    const goal = buildGoal({ id: "goal-1" });

    render(
      <SharedByMeCard
        sharedByMeGoals={[goal]}
        outgoingSharesByGoal={new Map()}
        profileDirectory={{}}
        onRevokeGoalShare={vi.fn()}
      />
    );

    expect(screen.getByText("No active recipients.")).toBeInTheDocument();
  });

  it("falls back to unknown for a recipient missing from the profile directory", () => {
    const goal = buildGoal({ id: "goal-1" });
    const shares = [buildGoalShare({ id: "s1", shared_with: "user-2" })];

    render(
      <SharedByMeCard
        sharedByMeGoals={[goal]}
        outgoingSharesByGoal={new Map([["goal-1", shares]])}
        profileDirectory={{}}
        onRevokeGoalShare={vi.fn()}
      />
    );

    expect(screen.getByText("@unknown")).toBeInTheDocument();
    expect(screen.getByText("No display name")).toBeInTheDocument();
  });

  it("calls onRevokeGoalShare with the goal id and recipient user id", async () => {
    const onRevokeGoalShare = vi.fn();
    const user = userEvent.setup();
    const goal = buildGoal({ id: "goal-1" });
    const shares = [buildGoalShare({ id: "s1", shared_with: "user-2" })];

    render(
      <SharedByMeCard
        sharedByMeGoals={[goal]}
        outgoingSharesByGoal={new Map([["goal-1", shares]])}
        profileDirectory={{ "user-2": buildProfile({ id: "user-2", username: "alex" }) }}
        onRevokeGoalShare={onRevokeGoalShare}
      />
    );

    await user.click(screen.getByRole("button"));
    expect(onRevokeGoalShare).toHaveBeenCalledWith("goal-1", "user-2");
  });
});
