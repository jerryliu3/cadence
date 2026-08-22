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
const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/xp/xp-profile-provider", () => ({
  useXpProfile: () => useXpProfileMock(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

describe("JourneyIntroOverlay", () => {
  beforeEach(() => {
    window.localStorage.clear();
    routerPushMock.mockReset();
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
    expect(await screen.findByRole("dialog", { name: "Welcome to Goalmaxxing" })).toBeInTheDocument();
  });

  it("keeps the intro modal vertically centered", async () => {
    render(<JourneyIntroOverlay />);
    const overlay = await screen.findByRole("dialog", {
      name: "Welcome to Goalmaxxing",
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
    expect(screen.queryByRole("dialog", { name: "Welcome to Goalmaxxing" })).toBeNull();

    window.dispatchEvent(new Event(JOURNEY_INTRO_OPEN_EVENT));

    expect(
      await screen.findByRole("dialog", { name: "Welcome to Goalmaxxing" })
    ).toBeInTheDocument();
  });

  it("skip intro persists completion and routes to goal creation", async () => {
    render(<JourneyIntroOverlay />);
    expect(await screen.findByRole("dialog", { name: "Welcome to Goalmaxxing" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip intro" }));

    expect(screen.queryByRole("dialog", { name: "Welcome to Goalmaxxing" })).toBeNull();
    expect(window.localStorage.getItem(JOURNEY_ONBOARDING_COMPLETED_KEY)).toBe("done");
    expect(window.localStorage.getItem(JOURNEY_INTRO_SEEN_KEY)).toBe(toLocalDateString());
    expect(routerPushMock).toHaveBeenCalledWith("/goals/new?onboarding=intro");
  });

  it("advances through steps, persists completion, and routes to first goal creation", async () => {
    render(<JourneyIntroOverlay />);
    expect(await screen.findByRole("dialog", { name: "Welcome to Goalmaxxing" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Your starter goals are ready" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByRole("dialog", { name: "Plan and execute" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Build momentum with community" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Create your first real goal" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create first goal" }));
    expect(screen.queryByRole("dialog", { name: "Create your first real goal" })).toBeNull();
    expect(window.localStorage.getItem(JOURNEY_ONBOARDING_COMPLETED_KEY)).toBe("done");
    expect(routerPushMock).toHaveBeenCalledWith("/goals/new?onboarding=intro");
  });
});
