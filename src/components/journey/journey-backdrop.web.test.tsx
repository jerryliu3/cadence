import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JourneyBackdrop } from "@/components/journey/journey-backdrop.web";

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
}));

const pathnameMock = vi.fn(() => "/app/social");
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock("@/components/xp/xp-profile-provider", () => ({
  useXpProfile: () => ({
    profile: {
      totalXp: 420,
    },
  }),
}));

const enabledFlags = {
  journeyEnabled: true,
} as const;

describe("JourneyBackdrop", () => {
  afterEach(() => {
    cleanup();
    pathnameMock.mockReturnValue("/app/social");
  });

  it("renders poster-first fallback immediately", () => {
    render(<JourneyBackdrop flags={enabledFlags} />);
    const posterImage = document.querySelector("[data-journey-layer='poster'] img");
    expect(posterImage).toBeInTheDocument();
  });

  it("keeps poster visible while video is not ready", () => {
    render(<JourneyBackdrop flags={enabledFlags} />);
    const posterLayer = document.querySelector("[data-journey-layer='poster']");
    expect(posterLayer).toHaveClass("opacity-100");
  });

  it("fades poster after video can play on community routes", () => {
    render(<JourneyBackdrop flags={enabledFlags} />);
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    if (!video) {
      return;
    }
    fireEvent.canPlay(video);
    const posterLayer = document.querySelector("[data-journey-layer='poster']");
    expect(posterLayer).toHaveClass("opacity-0");
  });

  it("prefers poster and skips video outside community and auth routes", () => {
    pathnameMock.mockReturnValue("/app/calendar");

    render(<JourneyBackdrop flags={enabledFlags} />);
    const video = document.querySelector("video");
    expect(video).toBeNull();
  });

  it("does not render video when journey is disabled", () => {
    render(
      <JourneyBackdrop
        flags={{
          ...enabledFlags,
          journeyEnabled: false,
        }}
      />
    );
    const video = document.querySelector("video");
    expect(video).toBeNull();
  });
});
