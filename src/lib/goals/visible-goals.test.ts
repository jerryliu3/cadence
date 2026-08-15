import { describe, expect, it } from "vitest";
import {
  progressSubjectUserId,
  selectViewerVisibleGoals,
} from "@cadence/shared/goals/visible-goals";

describe("selectViewerVisibleGoals", () => {
  it("keeps shared and participant goals for solo viewers", () => {
    const goals = [
      { id: "owned", owner_id: "me" },
      { id: "shared", owner_id: "friend" },
      { id: "group", owner_id: "club" },
    ];
    expect(
      selectViewerVisibleGoals({ goals, partnerId: null }).map((goal) => goal.id)
    ).toEqual(["owned", "shared", "group"]);
  });

  it("drops partner-owned goals without dropping third-party shares", () => {
    const goals = [
      { id: "owned", owner_id: "me" },
      { id: "shared", owner_id: "friend" },
      { id: "partner", owner_id: "partner" },
    ];
    expect(
      selectViewerVisibleGoals({ goals, partnerId: "partner" }).map((goal) => goal.id)
    ).toEqual(["owned", "shared"]);
  });

  it("keeps partner-created goals for an active viewer team", () => {
    const goals = [
      { id: "partner-personal", owner_id: "partner", team_id: null },
      {
        id: "partner-team",
        owner_id: "partner",
        team_id: "active-team",
      },
    ];

    expect(
      selectViewerVisibleGoals({
        goals,
        partnerId: "partner",
        memberTeamIds: ["active-team"],
      }).map((goal) => goal.id)
    ).toEqual(["partner-team"]);
  });

  it("omits subjectUserId for self progress reads", () => {
    expect(
      progressSubjectUserId({
        targetIsViewer: true,
        targetSubjectUserId: "me",
      })
    ).toBeUndefined();
    expect(
      progressSubjectUserId({
        targetIsViewer: false,
        targetSubjectUserId: "partner",
      })
    ).toBe("partner");
  });
});
