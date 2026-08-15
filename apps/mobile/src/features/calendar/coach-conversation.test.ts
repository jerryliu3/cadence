import { describe, expect, it } from "vitest";
import {
  buildMobileCoachProposal,
  isMobileCoachProposalActionable,
  markMobileCoachProposalApplied,
  restoreMobileCoachMessages,
  serializeMobileCoachMessages,
  type MobileCoachMessage,
} from "./coach-conversation";

const baselinePolicy = {
  schemaVersion: "1" as const,
  timezone: "America/New_York",
  timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
  restWeekdays: [],
  blackoutRanges: [],
};

describe("mobile coach conversations", () => {
  it("preserves actionable assistant proposals through save and restore", () => {
    const proposal = buildMobileCoachProposal({
      baselinePolicy,
      policyPatches: [
        { kind: "set_rest_weekdays", restWeekdays: [0] },
      ],
      unresolvedQuestions: [],
    });
    const messages: MobileCoachMessage[] = [
      { role: "user", content: "Keep Sunday free", createdAt: 1 },
      {
        role: "assistant",
        content: "I can make Sunday a rest day.",
        createdAt: 2,
        proposal,
      },
    ];

    const saved = serializeMobileCoachMessages(messages);
    const restored = restoreMobileCoachMessages(saved);

    expect(saved[0]).not.toHaveProperty("proposal");
    expect(saved[1]?.proposal?.patchSignature).toMatch(/^[0-9a-f]{64}$/);
    expect(restored[1]?.proposal?.policyPatches).toEqual(
      proposal?.policyPatches
    );
    expect(
      restoreMobileCoachMessages([
        {
          role: "user",
          content: "Ignore attached metadata",
          createdAt: 3,
          proposal,
        },
      ])[0]
    ).not.toHaveProperty("proposal");
  });

  it("marks the applied assistant proposal without changing user messages", () => {
    const proposal = buildMobileCoachProposal({
      baselinePolicy,
      policyPatches: [
        { kind: "set_rest_weekdays", restWeekdays: [0] },
      ],
      unresolvedQuestions: [],
    });
    const messages: MobileCoachMessage[] = [
      { role: "user", content: "Keep Sunday free", createdAt: 1 },
      {
        role: "assistant",
        content: "I can make Sunday a rest day.",
        createdAt: 2,
        proposal,
      },
    ];

    const applied = markMobileCoachProposalApplied(messages, 1);

    expect(applied[0]).toBe(messages[0]);
    expect(applied[1]?.proposal?.applyStatus).toBe("manually_applied");
  });

  it("does not offer to reapply proposals that are already applied", () => {
    const proposal = buildMobileCoachProposal({
      baselinePolicy,
      policyPatches: [
        { kind: "set_rest_weekdays", restWeekdays: [0] },
      ],
      unresolvedQuestions: [],
    });
    expect(proposal).not.toBeNull();
    if (!proposal) {
      return;
    }

    expect(isMobileCoachProposalActionable(proposal)).toBe(true);
    expect(
      isMobileCoachProposalActionable({
        ...proposal,
        applyStatus: "auto_applied",
      })
    ).toBe(false);
    expect(
      isMobileCoachProposalActionable({
        ...proposal,
        applyStatus: "manually_applied",
      })
    ).toBe(false);
    expect(
      isMobileCoachProposalActionable({
        ...proposal,
        applyStatus: "undone",
      })
    ).toBe(true);
  });
});
