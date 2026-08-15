import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyIntroOverlay, JOURNEY_INTRO_SEEN_KEY } from "@/components/intro/journey-intro-overlay";
import { toLocalDateString } from "@/lib/dates/day";

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

  it("keeps the intro modal vertically centered", async () => {
    render(<JourneyIntroOverlay />);
    const overlay = await screen.findByRole("dialog", {
      name: "Welcome to your climb",
    });
    expect(overlay).toHaveClass("items-center");
    expect(overlay).not.toHaveClass("items-end");
  });

  it("stays hidden once acknowledged", () => {
    window.localStorage.setItem(JOURNEY_INTRO_SEEN_KEY, toLocalDateString());
    const { container } = render(<JourneyIntroOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows intro again on a new calendar day", async () => {
    window.localStorage.setItem(JOURNEY_INTRO_SEEN_KEY, "2026-01-01");
    render(<JourneyIntroOverlay />);
    expect(
      await screen.findByRole("dialog", { name: "Welcome to your climb" })
    ).toBeInTheDocument();
  });
});
