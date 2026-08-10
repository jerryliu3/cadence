import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultGroupGoalDraft } from "@/features/social/group-goal-creator-card";
import { GroupGoalsCard } from "@/features/social/group-goals-card";
import { buildGoal, buildParticipant, buildProfile } from "@/lib/goals/goal-test-fixtures";

afterEach(() => {
  cleanup();
});

function baseProps(overrides: Partial<Parameters<typeof GroupGoalsCard>[0]> = {}) {
  return {
    draft: createDefaultGroupGoalDraft(),
    saving: false,
    requiresEndDate: false,
    onDraftChange: vi.fn(),
    onFrequencyTypeChange: vi.fn(),
    onCreateGoal: vi.fn(),
    groupGoals: [],
    participants: [],
    completionsByGoal: new Map(),
    profileDirectory: {},
    currentUserId: "user-1",
    onDeleteGroupGoal: vi.fn(),
    onLeaveGroup: vi.fn(),
    onRemoveParticipant: vi.fn(),
    ...overrides,
  };
}

describe("GroupGoalsCard", () => {
  it("shows an empty state and always renders the creator form", () => {
    render(<GroupGoalsCard {...baseProps()} />);

    expect(screen.getByText("No group goals available yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create group goal/i })).toBeInTheDocument();
  });

  it("shows a Delete button for goals the current user owns", async () => {
    const onDeleteGroupGoal = vi.fn();
    const user = userEvent.setup();
    const goal = buildGoal({ id: "goal-1", title: "Team run", owner_id: "user-1" });

    render(
      <GroupGoalsCard
        {...baseProps({ groupGoals: [goal], onDeleteGroupGoal })}
      />
    );

    expect(screen.getByText("Team run")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDeleteGroupGoal).toHaveBeenCalledWith("goal-1");
    expect(screen.queryByRole("button", { name: /leave/i })).not.toBeInTheDocument();
  });

  it("shows a Leave button for goals owned by someone else", async () => {
    const onLeaveGroup = vi.fn();
    const user = userEvent.setup();
    const goal = buildGoal({ id: "goal-1", owner_id: "user-2" });

    render(
      <GroupGoalsCard {...baseProps({ groupGoals: [goal], onLeaveGroup })} />
    );

    await user.click(screen.getByRole("button", { name: /leave/i }));
    expect(onLeaveGroup).toHaveBeenCalledWith("goal-1");
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("shows a no-participants message when a group goal has none", () => {
    const goal = buildGoal({ id: "goal-1" });
    render(<GroupGoalsCard {...baseProps({ groupGoals: [goal] })} />);

    expect(screen.getByText("No participants yet.")).toBeInTheDocument();
  });

  it("renders participant usernames and role labels", () => {
    const goal = buildGoal({ id: "goal-1", owner_id: "user-1" });
    const participants = [
      buildParticipant({ id: "p1", goal_id: "goal-1", user_id: "user-1", role: "owner" }),
      buildParticipant({ id: "p2", goal_id: "goal-1", user_id: "user-2", role: "participant" }),
    ];

    render(
      <GroupGoalsCard
        {...baseProps({
          groupGoals: [goal],
          participants,
          profileDirectory: {
            "user-1": buildProfile({ id: "user-1", username: "me" }),
            "user-2": buildProfile({ id: "user-2", username: "alex" }),
          },
        })}
      />
    );

    expect(screen.getByText("@me")).toBeInTheDocument();
    expect(screen.getByText("@alex")).toBeInTheDocument();
    expect(screen.getByText(/Participant · 0%/)).toBeInTheDocument();
  });

  it("shows an owner badge instead of a remove button for the owner row", () => {
    const goal = buildGoal({ id: "goal-1", owner_id: "user-1" });
    const participants = [
      buildParticipant({ id: "p1", goal_id: "goal-1", user_id: "user-1", role: "owner" }),
    ];

    render(
      <GroupGoalsCard
        {...baseProps({
          groupGoals: [goal],
          participants,
          profileDirectory: { "user-1": buildProfile({ id: "user-1", username: "me" }) },
        })}
      />
    );

    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: "" })).toHaveLength(0);
  });

  it("lets the owner remove a non-owner participant", async () => {
    const onRemoveParticipant = vi.fn();
    const user = userEvent.setup();
    const goal = buildGoal({ id: "goal-1", owner_id: "user-1" });
    const participants = [
      buildParticipant({ id: "p1", goal_id: "goal-1", user_id: "user-1", role: "owner" }),
      buildParticipant({ id: "p2", goal_id: "goal-1", user_id: "user-2", role: "participant" }),
    ];

    render(
      <GroupGoalsCard
        {...baseProps({
          groupGoals: [goal],
          participants,
          currentUserId: "user-1",
          onRemoveParticipant,
          profileDirectory: {
            "user-1": buildProfile({ id: "user-1", username: "me" }),
            "user-2": buildProfile({ id: "user-2", username: "alex" }),
          },
        })}
      />
    );

    const removeButtons = screen.getAllByRole("button", { name: "" });
    expect(removeButtons).toHaveLength(1);
    await user.click(removeButtons[0]);
    expect(onRemoveParticipant).toHaveBeenCalledWith("goal-1", "user-2");
  });

  it("does not show a remove control for non-owners viewing participants", () => {
    const goal = buildGoal({ id: "goal-1", owner_id: "user-1" });
    const participants = [
      buildParticipant({ id: "p1", goal_id: "goal-1", user_id: "user-1", role: "owner" }),
      buildParticipant({ id: "p2", goal_id: "goal-1", user_id: "user-2", role: "participant" }),
    ];

    render(
      <GroupGoalsCard
        {...baseProps({
          groupGoals: [goal],
          participants,
          currentUserId: "user-2",
          profileDirectory: {
            "user-1": buildProfile({ id: "user-1", username: "me" }),
            "user-2": buildProfile({ id: "user-2", username: "alex" }),
          },
        })}
      />
    );

    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: "" })).toHaveLength(0);
  });
});
