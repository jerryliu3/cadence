import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JourneyIntroOverlay,
  JOURNEY_ONBOARDING_COMPLETED_KEY,
  JOURNEY_INTRO_OPEN_EVENT,
  JOURNEY_INTRO_SEEN_KEY,
} from "@/components/intro/journey-intro-overlay";
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

  it("stays hidden once onboarding is completed", () => {
    window.localStorage.setItem(JOURNEY_ONBOARDING_COMPLETED_KEY, "done");
    const { container } = render(<JourneyIntroOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden for existing users who already saw legacy intro", () => {
    window.localStorage.setItem(JOURNEY_INTRO_SEEN_KEY, toLocalDateString());
    const { container } = render(<JourneyIntroOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reopens intro when settings triggers the revisit event", async () => {
    window.localStorage.setItem(JOURNEY_ONBOARDING_COMPLETED_KEY, "done");
    render(<JourneyIntroOverlay />);
    expect(screen.queryByRole("dialog", { name: "Welcome to your climb" })).toBeNull();

    window.dispatchEvent(new Event(JOURNEY_INTRO_OPEN_EVENT));

    expect(
      await screen.findByRole("dialog", { name: "Welcome to your climb" })
    ).toBeInTheDocument();
  });

  it("advances through steps and persists completion", async () => {
    render(<JourneyIntroOverlay />);
    expect(await screen.findByRole("dialog", { name: "Welcome to your climb" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Plan your week" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByRole("dialog", { name: "Capture one-off tasks" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Stay connected" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start journey" }));
    expect(screen.queryByRole("dialog", { name: "Stay connected" })).toBeNull();
    expect(window.localStorage.getItem(JOURNEY_ONBOARDING_COMPLETED_KEY)).toBe("done");
  });
});
