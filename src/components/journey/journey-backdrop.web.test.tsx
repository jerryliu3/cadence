import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JourneyBackdrop } from "@/components/journey/journey-backdrop.web";

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
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
  journeyVideoEnabled: true,
  journeyRiveEnabled: true,
  journeySocialOverlayEnabled: false,
  journeyAssetManifestVersion: "v1",
} as const;

describe("JourneyBackdrop", () => {
  afterEach(() => {
    cleanup();
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

  it("fades poster after video can play", () => {
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

  it("disables video when flag is off", () => {
    render(
      <JourneyBackdrop
        flags={{
          ...enabledFlags,
          journeyVideoEnabled: false,
        }}
      />
    );
    const video = document.querySelector("video");
    expect(video).toBeNull();
  });
});
