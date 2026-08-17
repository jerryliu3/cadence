import { describe, expect, it } from "vitest";
import {
  coachConversationProposalSchema,
  mapCoachConversationMessageRow,
} from "@/lib/planner/coach-conversations";

describe("coach conversation goal draft proposals", () => {
  it("accepts the additive goal draft proposal shape", () => {
    expect(
      coachConversationProposalSchema.parse({
        schemaVersion: "1",
        kind: "goal_draft",
        proposalId: "31000000-0000-4000-8000-000000000001",
        parserPrompt:
          "Easy run weekly from 2026-08-17 to 2026-09-13, total target 4.",
        creationStatus: "not_created",
      })
    ).toEqual({
      schemaVersion: "1",
      kind: "goal_draft",
      proposalId: "31000000-0000-4000-8000-000000000001",
      parserPrompt:
        "Easy run weekly from 2026-08-17 to 2026-09-13, total target 4.",
      creationStatus: "not_created",
    });
  });

  it("restores goal draft metadata from proposal_meta", () => {
    const message = mapCoachConversationMessageRow(
      {
        ordinal: 1,
        role: "assistant",
        content: "I drafted a running plan.",
        created_at: "2026-08-17T12:00:00.000Z",
        proposal_meta: {
          schemaVersion: "1",
          kind: "goal_draft",
          proposalId: "31000000-0000-4000-8000-000000000002",
          parserPrompt:
            "Easy run weekly from 2026-08-17 to 2026-09-13.",
          creationStatus: "created",
        },
      },
      0
    );

    expect(message.proposal).toMatchObject({
      kind: "goal_draft",
      creationStatus: "created",
    });
  });
});
