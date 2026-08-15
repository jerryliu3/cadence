import { describe, expect, it } from "vitest";
import { buildCoachMessageProposal } from "./coach-proposal";

const baselinePolicy = {
  schemaVersion: "1" as const,
  timezone: "America/New_York",
  timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
  restWeekdays: [],
  blackoutRanges: [],
};

describe("buildCoachMessageProposal", () => {
  it("builds canonical metadata for actionable patches", () => {
    const proposal = buildCoachMessageProposal({
      baselinePolicy,
      policyPatches: [
        { kind: "set_rest_weekdays" as const, restWeekdays: [0] },
      ],
      unresolvedQuestions: [],
      applyStatus: "not_applied",
    });

    expect(proposal).toMatchObject({
      schemaVersion: "1",
      applyStatus: "not_applied",
      baselinePolicy,
      appliedMoveEntryKeys: [],
      unresolvedQuestions: [],
    });
    expect(proposal?.patchSignature).toMatch(/^[0-9a-f]{64}$/);
    expect(proposal?.baselineSnapshotToken).toMatch(/^policy:[0-9a-f]{64}$/);
  });

  it("returns no proposal when there are no patches", () => {
    expect(
      buildCoachMessageProposal({
        baselinePolicy,
        policyPatches: [],
        unresolvedQuestions: [],
        applyStatus: "not_applied",
      })
    ).toBeNull();
  });
});
