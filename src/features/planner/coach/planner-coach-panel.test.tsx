import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlannerCoachPanel } from "@/features/planner/coach/planner-coach-panel";
import type { PlannerCoachModel } from "@/features/planner/coach/coach-types";

function buildCoachModel(
  overrides: Partial<PlannerCoachModel["state"]> = {}
): PlannerCoachModel {
  const actions: PlannerCoachModel["actions"] = {
    setCoachInput: vi.fn(),
    setSelectedSavedCoachConversationId: vi.fn(),
    sendCoachMessage: vi.fn().mockResolvedValue(undefined),
    saveCoachConversation: vi.fn().mockResolvedValue(undefined),
    restoreSavedCoachConversation: vi.fn().mockResolvedValue(undefined),
    startNewCoachConversation: vi.fn(),
    applyCoachProposal: vi.fn().mockResolvedValue(undefined),
    rejectCoachProposal: vi.fn(),
    requestCalendarEditsFromCoach: vi.fn(),
    undoCoachProposal: vi.fn().mockResolvedValue(undefined),
    resetForPlannerStateReset: vi.fn(),
    onDraftDiscarded: vi.fn(),
  };

  return {
    state: {
      canUseCoach: true,
      coachLoading: false,
      coachInput: "",
      coachMessages: [],
      savedCoachConversations: [],
      selectedSavedCoachConversationId: "",
      coachConversationsLoading: false,
      coachConversationSaving: false,
      coachConversationRestoring: false,
      coachWarnings: [],
      coachRecommendations: [],
      coachPendingPatches: [],
      coachUnresolvedQuestions: [],
      coachPolicyApplying: false,
      coachLastProposalMeta: null,
      hasCoachUndoSnapshot: false,
      hasCoachConversationState: false,
      ...overrides,
    },
    actions,
  };
}

describe("planner coach panel", () => {
  it("does not render when coach capability is unavailable", () => {
    const coach = buildCoachModel({ canUseCoach: false });
    render(<PlannerCoachPanel coach={coach} />);
    expect(screen.queryByText("AI Coach")).not.toBeInTheDocument();
  });

  it("wires save and send actions", async () => {
    const coach = buildCoachModel({
      coachInput: "Help me schedule runs",
      coachMessages: [
        {
          role: "user",
          content: "Help me schedule runs",
          createdAt: Date.now(),
        },
      ],
      hasCoachConversationState: true,
    });
    const user = userEvent.setup();

    render(<PlannerCoachPanel coach={coach} />);
    await user.click(screen.getByRole("button", { name: "Save conversation" }));
    expect(coach.actions.saveCoachConversation).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Send to coach" }));
    expect(coach.actions.sendCoachMessage).toHaveBeenCalledTimes(1);
  });
});
