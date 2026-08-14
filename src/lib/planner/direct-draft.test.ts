import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import type { PlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  buildDirectDraftPersistence,
  PlannerDirectDraftValidationError,
} from "@/lib/planner/direct-draft";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";

const goal: Goal = {
  id: "22222222-2222-4222-8222-222222222222",
  owner_id: "11111111-1111-4111-8111-111111111111",
  title: "Launch",
  description: null,
  category: "Personal",
  color: null,
  frequency_type: "fixed_milestones",
  recurrence_interval: null,
  target_count: 2,
  milestone_names: ["Draft", "Ship"],
  start_date: "2026-08-01",
  end_date: "2026-09-30",
  photo_path: null,
  team_id: null,
  is_deleted: false,
  archived_at: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const assignments = [
  {
    goalId: goal.id,
    requirementFingerprint: computeRequirementFingerprint(goal),
    unitKey: "milestone:1",
    scheduledDate: "2026-08-10",
    locked: false,
  },
  {
    goalId: goal.id,
    requirementFingerprint: computeRequirementFingerprint(goal),
    unitKey: "milestone:2",
    scheduledDate: "2026-09-10",
    locked: false,
  },
] as const;

const snapshot = {
  goals: [goal],
  completions: [],
  links: [],
  revisions: { canonicalRevision: 0, executionRevision: 0 },
  preferences: null,
  activePlan: {
    goals: [
      {
        id: goal.id,
        original_goal_id: goal.id,
      },
    ],
    items: assignments.map((assignment, index) => ({
      id: `item-${index}`,
      plan_goal_id: goal.id,
      unit_key: assignment.unitKey,
      scheduled_date: assignment.scheduledDate,
      original_scheduled_date: assignment.scheduledDate,
      classification: "open",
      credit_state: "uncredited",
      locked: assignment.locked,
    })),
    basePlan: {
      assignments,
      completionToUnit: {},
    },
  },
} as unknown as PlannerCanonicalSnapshot;

describe("buildDirectDraftPersistence", () => {
  it("moves one milestone across months without changing another item", () => {
    const result = buildDirectDraftPersistence({
      snapshot,
      commands: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          sequence: 1,
          kind: "move_item",
          goalId: goal.id,
          unitKey: "milestone:1",
          sourceDate: "2026-08-10",
          scheduledDate: "2026-09-20",
        },
      ],
      asOfDate: "2026-08-05",
    });

    expect(
      result.map((item) => [item.unit_key, item.scheduled_date])
    ).toEqual([
      ["milestone:1", "2026-09-20"],
      ["milestone:2", "2026-09-10"],
    ]);
  });

  it("rejects a duplicate date without moving either item", () => {
    expect(() =>
      buildDirectDraftPersistence({
        snapshot,
        commands: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            sequence: 1,
            kind: "move_item",
            goalId: goal.id,
            unitKey: "milestone:1",
            sourceDate: "2026-08-10",
            scheduledDate: "2026-09-10",
          },
        ],
        asOfDate: "2026-08-05",
      })
    ).toThrowError(
      expect.objectContaining<Partial<PlannerDirectDraftValidationError>>({
        code: "draft_destination_conflict",
      })
    );
  });

  it("rejects moving an ordinal credited by an off-schedule completion", () => {
    expect(() =>
      buildDirectDraftPersistence({
        snapshot: {
          ...snapshot,
          completions: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              goal_id: goal.id,
              user_id: goal.owner_id,
              completed_on: "2026-08-04",
              source: "manual",
              created_at: "2026-08-08T12:00:00Z",
            },
          ],
        },
        commands: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            sequence: 1,
            kind: "move_item",
            goalId: goal.id,
            unitKey: "milestone:1",
            sourceDate: "2026-08-10",
            scheduledDate: "2026-08-20",
          },
        ],
        asOfDate: "2026-08-05",
      })
    ).toThrowError(
      expect.objectContaining<Partial<PlannerDirectDraftValidationError>>({
        code: "draft_item_unmovable",
      })
    );
  });


  // The direct path is selected whenever a draft carries any command and no
  // policy override, so non-move commands have to survive it on their own.
  it("projects a time override onto a draft with no move commands", () => {
    const result = buildDirectDraftPersistence({
      snapshot,
      commands: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          sequence: 1,
          kind: "set_item_time_override",
          goalId: goal.id,
          unitKey: "milestone:1",
          localTime: "07:15",
        },
      ],
      asOfDate: "2026-08-05",
    });

    expect(result.find((item) => item.unit_key === "milestone:1")).toMatchObject({
      scheduled_time_override: "07:15",
      scheduled_date: "2026-08-10",
    });
  });

  it("clears a time override without disturbing the scheduled date", () => {
    const result = buildDirectDraftPersistence({
      snapshot,
      commands: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          sequence: 1,
          kind: "set_item_time_override",
          goalId: goal.id,
          unitKey: "milestone:1",
          localTime: "07:15",
        },
        {
          id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          sequence: 2,
          kind: "clear_item_time_override",
          goalId: goal.id,
          unitKey: "milestone:1",
        },
      ],
      asOfDate: "2026-08-05",
    });

    expect(result.find((item) => item.unit_key === "milestone:1")).toMatchObject({
      scheduled_time_override: null,
      scheduled_date: "2026-08-10",
    });
  });

  it("keeps every persisted identity when the draft only retimes", () => {
    const result = buildDirectDraftPersistence({
      snapshot,
      commands: [
        {
          id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          sequence: 1,
          kind: "set_item_time_override",
          goalId: goal.id,
          unitKey: "milestone:1",
          localTime: "06:30",
        },
        {
          id: "ccccccc1-cccc-4ccc-8ccc-cccccccccccc",
          sequence: 2,
          kind: "set_item_time_override",
          goalId: goal.id,
          unitKey: "milestone:2",
          localTime: "18:00",
        },
      ],
      asOfDate: "2026-08-05",
    });

    expect(
      result.map((item) => [item.unit_key, item.scheduled_date])
    ).toEqual([
      ["milestone:1", "2026-08-10"],
      ["milestone:2", "2026-09-10"],
    ]);
    expect(result.find((item) => item.unit_key === "milestone:2")).toMatchObject({
      scheduled_time_override: "18:00",
    });
  });
});
