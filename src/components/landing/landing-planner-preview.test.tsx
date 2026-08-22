import { describe, expect, it } from "vitest";
import {
  nextPlannerDemoPhase,
  type PlannerDemoPhase,
} from "@/components/landing/landing-planner-preview";

describe("nextPlannerDemoPhase", () => {
  it("runs the lifted-arc sequence through month and back to week", () => {
    const phases: PlannerDemoPhase[] = [];
    let phase: PlannerDemoPhase = "editing";

    for (let index = 0; index < 11; index += 1) {
      phase = nextPlannerDemoPhase(phase, false);
      phases.push(phase);
    }

    expect(phases).toEqual([
      "lifting",
      "moving",
      "settling",
      "saving",
      "saved",
      "opening-month-menu",
      "selecting-month",
      "month",
      "opening-week-menu",
      "selecting-week",
      "editing",
    ]);
  });

  it("keeps week and month states while skipping motion", () => {
    const phases: PlannerDemoPhase[] = [];
    let phase: PlannerDemoPhase = "editing";

    for (let index = 0; index < 4; index += 1) {
      phase = nextPlannerDemoPhase(phase, true);
      phases.push(phase);
    }

    expect(phases).toEqual(["saving", "saved", "month", "editing"]);
  });
});
