import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyIntroOverlay } from "@/components/intro/journey-intro-overlay";

const useXpProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/xp/xp-profile-provider", () => ({
  useXpProfile: () => useXpProfileMock(),
}));

describe("JourneyIntroOverlay", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useXpProfileMock.mockReturnValue({
      band: { name: "Trailhead" },
      profile: { currentLevel: 1, totalXp: 0 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows intro when unseen", async () => {
    render(<JourneyIntroOverlay />);
    expect(await screen.findByText("Welcome to your climb")).toBeInTheDocument();
  });

  it("stays hidden once acknowledged", () => {
    window.localStorage.setItem("cadence.journey_intro_seen.v1", "true");
    const { container } = render(<JourneyIntroOverlay />);
    expect(container).toBeEmptyDOMElement();
  });
});
