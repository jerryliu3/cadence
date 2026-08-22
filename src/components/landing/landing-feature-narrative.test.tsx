import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  accountabilityEvents,
  featureScenes,
  LandingFeatureNarrative,
  selectFeatureIndex,
} from "@/components/landing/landing-feature-narrative";

describe("selectFeatureIndex", () => {
  it("selects scenes in visual order around one viewport anchor", () => {
    expect(selectFeatureIndex([300, 900, 1500], 320)).toBe(0);
    expect(selectFeatureIndex([-300, 300, 900], 320)).toBe(1);
    expect(selectFeatureIndex([-900, -300, 300], 320)).toBe(2);
  });

  it("pairs each mobile why card with its matching reasoning", () => {
    render(<LandingFeatureNarrative />);

    const habitCard = screen
      .getByRole("heading", { name: "Too habit-focused" })
      .closest("article");
    const rigidCard = screen
      .getByRole("heading", { name: "Too rigid" })
      .closest("article");
    const isolatedCard = screen
      .getByRole("heading", { name: "Too isolated" })
      .closest("article");

    expect(habitCard).not.toBeNull();
    expect(rigidCard).not.toBeNull();
    expect(isolatedCard).not.toBeNull();
    expect(within(habitCard as HTMLElement).getByText(featureScenes[0].summary)).toBeVisible();
    expect(within(habitCard as HTMLElement).getByText("Outcome over repetition")).toBeVisible();
    expect(within(rigidCard as HTMLElement).getByText("Keep the plan moving")).toBeVisible();
    expect(
      within(isolatedCard as HTMLElement).getByText("Accountability loop")
    ).toBeVisible();
  });
});

describe("landing why seeds", () => {
  it("uses the why categories instead of product-capability tiles", () => {
    expect(featureScenes.map((scene) => scene.title)).toEqual([
      "Too habit-focused",
      "Too rigid",
      "Too isolated",
    ]);
    expect(accountabilityEvents.map((event) => event.kind)).toEqual([
      "feed",
      "nudge",
    ]);
    expect(featureScenes[0].summary).toMatch(/streaks reward repetition/i);
    expect(featureScenes[0].reasoning).toMatch(/beyond daily habits/i);
    expect(featureScenes[2].reasoning).not.toMatch(/request feedback/i);
  });
});
