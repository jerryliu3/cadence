import type { DuoScope } from "@cadence/shared/social/duo";
import type { ChecklistLaneData } from "./use-checklist-data";

export type ChecklistSummaryStripState =
  | { status: "loading"; partnerName: string }
  | { status: "unavailable"; partnerName: string }
  | {
      status: "ready";
      partnerName: string;
      completionCount: number;
      goalCount: number;
    };

export type ChecklistListItem =
  | { key: string; type: "date"; asOfDate: string }
  | { key: string; type: "new_goal" }
  | { key: string; type: "summary_strip"; summary: ChecklistSummaryStripState }
  | {
      key: string;
      type: "lane_heading";
      laneId: "viewer" | "partner";
      label: string;
      readOnly: boolean;
    }
  | {
      key: string;
      type: "lane_message";
      laneId: "viewer" | "partner";
      text: string;
      tone: "muted" | "destructive";
    }
  | {
      key: string;
      type: "goal_row";
      laneId: "viewer" | "partner";
      goalId: string;
      title: string;
      category: string;
      done: boolean;
      interactive: boolean;
    };

export function buildChecklistListItems({
  scope,
  asOfDate,
  showNewGoalAction,
  summaryStrip,
  lanes,
}: {
  scope: DuoScope;
  asOfDate: string;
  showNewGoalAction: boolean;
  summaryStrip: ChecklistSummaryStripState | null;
  lanes: Array<{
    lane: {
      id: "viewer" | "partner";
      label: string;
      readOnly: boolean;
    };
    laneData: ChecklistLaneData;
  }>;
}): ChecklistListItem[] {
  const items: ChecklistListItem[] = [{ key: "date", type: "date", asOfDate }];
  if (showNewGoalAction) {
    items.push({ key: "new-goal", type: "new_goal" });
  }
  if (summaryStrip) {
    items.push({ key: "summary-strip", type: "summary_strip", summary: summaryStrip });
  }

  for (const { lane, laneData } of lanes) {
    if (scope !== "me") {
      items.push({
        key: `heading-${lane.id}`,
        type: "lane_heading",
        laneId: lane.id,
        label: lane.label,
        readOnly: lane.readOnly,
      });
    }

    if (laneData.loading) {
      items.push({
        key: `message-loading-${lane.id}`,
        type: "lane_message",
        laneId: lane.id,
        text: `Loading ${lane.label.toLowerCase()} checklist...`,
        tone: "muted",
      });
      continue;
    }

    if (lane.id === "partner" && laneData.error) {
      items.push({
        key: `message-partner-unavailable-${lane.id}`,
        type: "lane_message",
        laneId: lane.id,
        text: "Partner checklist is unavailable.",
        tone: "muted",
      });
      continue;
    }

    if (laneData.error) {
      items.push({
        key: `message-error-${lane.id}`,
        type: "lane_message",
        laneId: lane.id,
        text:
          laneData.error instanceof Error
            ? laneData.error.message
            : "Could not load checklist.",
        tone: "destructive",
      });
      continue;
    }

    if (laneData.completionErrorMessage) {
      items.push({
        key: `message-completion-error-${lane.id}`,
        type: "lane_message",
        laneId: lane.id,
        text: laneData.completionErrorMessage,
        tone: "destructive",
      });
    }

    if (laneData.goals.length === 0) {
      items.push({
        key: `message-empty-${lane.id}`,
        type: "lane_message",
        laneId: lane.id,
        text: "No goals yet.",
        tone: "muted",
      });
      continue;
    }

    for (const goal of laneData.goals) {
      items.push({
        key: `goal-${lane.id}-${goal.id}`,
        type: "goal_row",
        laneId: lane.id,
        goalId: goal.id,
        title: goal.title,
        category: goal.category,
        done: laneData.completedToday.has(goal.id),
        interactive: laneData.canToggleGoal(goal.id),
      });
    }
  }

  return items;
}
