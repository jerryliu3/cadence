import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getMonthDemoEntries,
  isBusyPlannerDemoPhase,
  LandingPlannerPreview,
  monthEntries,
  nextPlannerDemoPhase,
  phaseDurationMs,
  plannerDemoViewOptions,
  SEEDED_TODAY,
  type PlannerDemoPhase,
} from "@/components/landing/landing-planner-preview";

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

describe("nextPlannerDemoPhase", () => {
  it("starts on month, saves through a clicked Save plan control, then completes a week session", () => {
    const phases: PlannerDemoPhase[] = [];
    let phase: PlannerDemoPhase = "month";

    for (let index = 0; index < 19; index += 1) {
      phase = nextPlannerDemoPhase(phase, false);
      phases.push(phase);
    }

    expect(phases).toEqual([
      "month-lifting-past",
      "month-moving-past",
      "month-settling-past",
      "month-lifting-future",
      "month-moving-future",
      "month-settling-future",
      "clicking-save",
      "saving",
      "saved",
      "opening-week-menu",
      "selecting-week",
      "week",
      "week-tapping",
      "week-preview",
      "week-completing",
      "week-completed",
      "opening-month-menu",
      "selecting-month",
      "month",
    ]);
  });

  it("holds one understandable month state with reduced motion", () => {
    expect(nextPlannerDemoPhase("month", true)).toBe("month");
    expect(nextPlannerDemoPhase("week", true)).toBe("month");
  });

  it("gives every month entry text and marks one seeded current day", () => {
    expect(monthEntries.every((entry) => entry.label.trim().length > 0)).toBe(
      true
    );
    expect(SEEDED_TODAY).toBe(15);
  });

  it("pauses about two seconds before opening the view menu", () => {
    expect(phaseDurationMs["week-completed"]).toBeGreaterThanOrEqual(2000);
    expect(phaseDurationMs.saved).toBeGreaterThanOrEqual(2000);
  });

  it("includes the same view modes as the live planner", () => {
    expect(plannerDemoViewOptions.map((option) => option.label)).toEqual([
      "Month",
      "Week",
      "3 Day",
      "Day",
    ]);
  });
});

describe("planner demo status", () => {
  it("treats switching, moving, and saving as busy work", () => {
    expect(isBusyPlannerDemoPhase("opening-month-menu")).toBe(true);
    expect(isBusyPlannerDemoPhase("month-moving-past")).toBe(true);
    expect(isBusyPlannerDemoPhase("month-lifting-future")).toBe(true);
    expect(isBusyPlannerDemoPhase("clicking-save")).toBe(true);
    expect(isBusyPlannerDemoPhase("saving")).toBe(true);
    expect(isBusyPlannerDemoPhase("week")).toBe(false);
    expect(isBusyPlannerDemoPhase("saved")).toBe(false);
  });
});

describe("getMonthDemoEntries", () => {
  it("shows draft ghosts while moving, then commits after save", () => {
    expect(
      getMonthDemoEntries(8, "saving").map((entry) => entry.variant)
    ).toEqual(["ghost"]);
    expect(
      getMonthDemoEntries(24, "saving").map((entry) => ({
        id: entry.id,
        variant: entry.variant,
      }))
    ).toEqual([
      { id: "review", variant: "default" },
      { id: "tempo", variant: "new" },
    ]);

    expect(getMonthDemoEntries(8, "saved")).toEqual([]);
    expect(
      getMonthDemoEntries(24, "saved").map((entry) => ({
        id: entry.id,
        variant: entry.variant,
      }))
    ).toEqual([
      { id: "review", variant: "default" },
      { id: "tempo", variant: "default" },
    ]);
    expect(
      getMonthDemoEntries(SEEDED_TODAY, "saved").map((entry) => entry.id)
    ).toEqual(["launch", "strength"]);
  });
});

describe("LandingPlannerPreview copy", () => {
  it("does not strike completed week sessions or repeat Today's plan", () => {
    render(<LandingPlannerPreview />);

    expect(screen.queryByText("Today's plan")).not.toBeInTheDocument();
    for (const label of screen.getAllByText("Tempo run")) {
      expect(label).not.toHaveClass("line-through");
    }
  });
});
