import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XpLevelBadge } from "./xp-level-badge";

const useXpProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/xp/xp-profile-provider", () => ({
  useXpProfile: () => useXpProfileMock(),
}));

describe("XpLevelBadge", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing while loading", () => {
    useXpProfileMock.mockReturnValue({
      loading: true,
      profile: null,
    });
    const { container } = render(<XpLevelBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders level and progression copy when profile is loaded", () => {
    useXpProfileMock.mockReturnValue({
      loading: false,
      profile: {
        totalXp: 220,
        currentLevel: 2,
        nextLevel: 3,
        xpToNextLevel: 30,
        currentLevelMinXp: 100,
        nextLevelMinXp: 250,
      },
    });
    render(<XpLevelBadge />);

    expect(screen.getByText("Lv 2 · 120 XP")).toBeInTheDocument();
    expect(screen.getByText("120 / 150 XP to Lv 3")).toBeInTheDocument();
  });
});
