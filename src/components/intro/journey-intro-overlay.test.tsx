import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyIntroOverlay, JOURNEY_INTRO_SEEN_KEY } from "@/components/intro/journey-intro-overlay";

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
    expect(await screen.findByRole("dialog", { name: "Welcome to your climb" })).toBeInTheDocument();
  });

  it("stays hidden once acknowledged", () => {
    window.localStorage.setItem(JOURNEY_INTRO_SEEN_KEY, "true");
    const { container } = render(<JourneyIntroOverlay />);
    expect(container).toBeEmptyDOMElement();
  });
});
