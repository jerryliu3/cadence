import { describe, expect, it } from "vitest";
import {
  monthEntries,
  nextPlannerDemoPhase,
  SEEDED_TODAY,
  type PlannerDemoPhase,
} from "@/components/landing/landing-planner-preview";

describe("nextPlannerDemoPhase", () => {
  it("completes a week session, moves two month sessions, and saves once", () => {
    const phases: PlannerDemoPhase[] = [];
    let phase: PlannerDemoPhase = "week";

    for (let index = 0; index < 17; index += 1) {
      phase = nextPlannerDemoPhase(phase, false);
      phases.push(phase);
    }

    expect(phases).toEqual([
      "week-preview",
      "week-completing",
      "week-completed",
      "opening-month-menu",
      "selecting-month",
      "month",
      "month-lifting-past",
      "month-moving-past",
      "month-settling-past",
      "month-lifting-future",
      "month-moving-future",
      "month-settling-future",
      "saving",
      "saved",
      "opening-week-menu",
      "selecting-week",
      "week",
    ]);
  });

  it("holds one understandable completed week state with reduced motion", () => {
    expect(nextPlannerDemoPhase("week", true)).toBe("week-completed");
    expect(nextPlannerDemoPhase("week-completed", true)).toBe("week-completed");
  });

  it("gives every month entry text and marks one seeded current day", () => {
    expect(monthEntries.every((entry) => entry.label.trim().length > 0)).toBe(true);
    expect(SEEDED_TODAY).toBe(15);
  });
});
