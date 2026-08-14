import { describe, expect, it } from "vitest";
import type { DuoLaneSubject } from "@cadence/shared/social/duo";
import type { ChecklistLaneData } from "./use-checklist-data";
import { buildChecklistListItems } from "./checklist-list-model";

function buildLaneData(input: {
  subject: DuoLaneSubject;
  loading?: boolean;
  error?: unknown;
  interactive?: boolean;
  goals?: Array<{ id: string; title: string; category: string }>;
  completedIds?: string[];
}): ChecklistLaneData {
  return {
    subject: input.subject,
    loading: input.loading ?? false,
    error: input.error ?? null,
    goals: (input.goals ?? []).map((goal) => ({
      ...goal,
      owner_id: input.subject.userId ?? "viewer-1",
      description: null,
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: 1,
      start_date: "2026-01-01",
      end_date: null,
      photo_path: null,
      archived_at: null,
      is_deleted: false,
    })),
    completedToday: new Set(input.completedIds ?? []),
    completionCount: 0,
    goalCount: 0,
    interactive: input.interactive ?? false,
    toggle: null,
    toggling: false,
    refresh: () => undefined,
    progress: null,
  };
}

describe("buildChecklistListItems", () => {
  it("builds flattened viewer-then-partner sections in both scope", () => {
    const viewerLane = buildLaneData({
      subject: { id: "viewer", label: "Mine", readOnly: false },
      interactive: true,
      goals: [{ id: "viewer-goal", title: "Viewer goal", category: "Health" }],
      completedIds: ["viewer-goal"],
    });
    const partnerLane = buildLaneData({
      subject: { id: "partner", label: "Alex", readOnly: true, userId: "partner-1" },
      interactive: false,
      goals: [{ id: "partner-goal", title: "Partner goal", category: "Career" }],
      completedIds: [],
    });

    const items = buildChecklistListItems({
      scope: "both",
      asOfDate: "2026-08-14",
      showNewGoalAction: true,
      summaryStrip: null,
      lanes: [
        { lane: viewerLane.subject, laneData: viewerLane },
        { lane: partnerLane.subject, laneData: partnerLane },
      ],
    });

    expect(items.map((item) => item.type)).toEqual([
      "date",
      "new_goal",
      "lane_heading",
      "goal_row",
      "lane_heading",
      "goal_row",
    ]);
    expect(items[2]).toMatchObject({
      type: "lane_heading",
      laneId: "viewer",
      readOnly: false,
    });
    expect(items[4]).toMatchObject({
      type: "lane_heading",
      laneId: "partner",
      readOnly: true,
    });
    expect(items[5]).toMatchObject({
      type: "goal_row",
      laneId: "partner",
      interactive: false,
    });
  });

  it("includes loading and unavailable rows in lane order", () => {
    const viewerLane = buildLaneData({
      subject: { id: "viewer", label: "Mine", readOnly: false },
      loading: true,
    });
    const partnerLane = buildLaneData({
      subject: { id: "partner", label: "Alex", readOnly: true, userId: "partner-1" },
      error: new Error("partner unavailable"),
    });

    const items = buildChecklistListItems({
      scope: "both",
      asOfDate: "2026-08-14",
      showNewGoalAction: false,
      summaryStrip: { status: "unavailable", partnerName: "Alex" },
      lanes: [
        { lane: viewerLane.subject, laneData: viewerLane },
        { lane: partnerLane.subject, laneData: partnerLane },
      ],
    });

    expect(items.map((item) => item.type)).toEqual([
      "date",
      "summary_strip",
      "lane_heading",
      "lane_message",
      "lane_heading",
      "lane_message",
    ]);
    expect(items[3]).toMatchObject({
      type: "lane_message",
      laneId: "viewer",
      tone: "muted",
    });
    expect(items[5]).toMatchObject({
      type: "lane_message",
      laneId: "partner",
      tone: "muted",
      text: "Partner checklist is unavailable.",
    });
  });
});
