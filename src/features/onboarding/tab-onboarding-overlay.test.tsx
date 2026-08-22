import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TabOnboardingOverlay } from "@/features/onboarding/tab-onboarding-overlay";

describe("TabOnboardingOverlay", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens for first-time tab visits and persists completion", async () => {
    render(
      <TabOnboardingOverlay
        onboardingKey="planner.checklist"
        title="Planner guide"
        description="Use checklist to focus today."
      />
    );

    expect(await screen.findByRole("dialog", { name: "Planner guide" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(screen.queryByRole("dialog", { name: "Planner guide" })).toBeNull();
    expect(
      window.localStorage.getItem(
        "cadence.tab_onboarding_completed.v1:planner.checklist"
      )
    ).toBe("done");
  });

  it("stays hidden after completion unless force-opened", async () => {
    window.localStorage.setItem(
      "cadence.tab_onboarding_completed.v1:planner.checklist",
      "done"
    );

    const { rerender } = render(
      <TabOnboardingOverlay
        onboardingKey="planner.checklist"
        title="Planner guide"
        description="Use checklist to focus today."
      />
    );
    expect(screen.queryByRole("dialog", { name: "Planner guide" })).toBeNull();

    rerender(
      <TabOnboardingOverlay
        onboardingKey="planner.checklist"
        title="Planner guide"
        description="Use checklist to focus today."
        forceOpen
      />
    );
    expect(
      await screen.findByRole("dialog", { name: "Planner guide" })
    ).toBeInTheDocument();
  });

  it("dismisses a force-open replay for the current render token", async () => {
    window.localStorage.setItem(
      "cadence.tab_onboarding_completed.v1:planner.checklist",
      "done"
    );

    const { rerender } = render(
      <TabOnboardingOverlay
        onboardingKey="planner.checklist"
        title="Planner guide"
        description="Use checklist to focus today."
        forceOpen
      />
    );

    expect(await screen.findByRole("dialog", { name: "Planner guide" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("dialog", { name: "Planner guide" })).toBeNull();

    rerender(
      <TabOnboardingOverlay
        onboardingKey="planner.checklist"
        title="Planner guide"
        description="Use checklist to focus today."
        forceOpen
      />
    );
    expect(screen.queryByRole("dialog", { name: "Planner guide" })).toBeNull();
  });
});
