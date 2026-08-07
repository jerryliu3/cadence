import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      coachUnresolvedQuestions: [],
      coachPolicyApplying: false,
      hasCoachConversationState: false,
      ...overrides,
    },
    actions,
  };
}

describe("planner coach panel", () => {
  afterEach(() => {
    cleanup();
  });

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

  it("wires restore and proposal actions", async () => {
    const coach = buildCoachModel({
      selectedSavedCoachConversationId: "conversation-1",
      coachMessages: [
        {
          role: "assistant",
          content: "Let's update your spacing strategy.",
          createdAt: 123,
          proposal: {
            schemaVersion: "1",
            applyStatus: "auto_applied",
            patchSignature:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            baselineSnapshotToken:
              "policy:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            baselinePolicy: {
              schemaVersion: "1",
              timezone: "UTC",
              timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
              restWeekdays: [],
              blackoutRanges: [],
              goalAllowedWeekdays: {},
              datePreferences: [],
              spacingStrategy: "even",
              goalSpacingStrategies: {},
              dailyCadenceRestExemption: true,
            },
            policyPatches: [
              {
                kind: "set_spacing_strategy",
                spacingStrategy: "even",
              },
            ],
            unresolvedQuestions: [],
          },
        },
      ],
      savedCoachConversations: [
        {
          id: "conversation-1",
          scopeMonth: "2026-08",
          timezone: "UTC",
          title: "Saved chat",
          previewText: "Help me train",
          messageCount: 2,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
    });
    const user = userEvent.setup();

    render(<PlannerCoachPanel coach={coach} />);
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Re-apply changes" }));
    expect(coach.actions.applyCoachProposal).toHaveBeenCalledWith(0);

    await user.click(screen.getByRole("button", { name: "Undo proposal" }));
    expect(coach.actions.undoCoachProposal).toHaveBeenCalledWith(0);
  });
});
