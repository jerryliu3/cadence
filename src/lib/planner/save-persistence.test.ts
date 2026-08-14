import { describe, expect, it } from "vitest";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { shouldUseDirectDraftPersistence } from "@/lib/planner/save-persistence";

const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");

describe("shouldUseDirectDraftPersistence", () => {
  it("returns true for direct draft commands without policy override", () => {
    expect(
      shouldUseDirectDraftPersistence({
        draftCommands: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            sequence: 1,
            kind: "move_item",
            goalId: "22222222-2222-4222-8222-222222222222",
            unitKey: "milestone:1",
            sourceDate: "2026-08-10",
            scheduledDate: "2026-08-20",
          },
        ],
        requestedPolicy: null,
      })
    ).toBe(true);
  });

  it("returns false for mixed policy plus draft commands", () => {
    expect(
      shouldUseDirectDraftPersistence({
        draftCommands: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            sequence: 1,
            kind: "move_item",
            goalId: "22222222-2222-4222-8222-222222222222",
            unitKey: "milestone:1",
            sourceDate: "2026-08-10",
            scheduledDate: "2026-08-20",
          },
        ],
        requestedPolicy: policy,
      })
    ).toBe(false);
  });

  it("returns false when no draft commands exist", () => {
    expect(
      shouldUseDirectDraftPersistence({
        draftCommands: [],
        requestedPolicy: null,
      })
    ).toBe(false);
  });
});
