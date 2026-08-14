import { describe, expect, it } from "vitest";
import { selectViewerVisibleGoals } from "@/lib/goals/visible-goals";

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
});
