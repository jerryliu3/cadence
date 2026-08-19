import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { XpProgressBar } from "@/components/xp/xp-progress-bar";
import { bandForTotalXp } from "@/lib/xp/altitude";

const useXpProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/xp/xp-profile-provider", () => ({
  useXpProfile: () => useXpProfileMock(),
}));

describe("XpProgressBar", () => {
  it("renders a level progress summary and target", () => {
    useXpProfileMock.mockReturnValue({
      profile: {
        totalXp: 320,
        currentLevel: 2,
        currentLevelMinXp: 100,
        nextLevel: 3,
        nextLevelMinXp: 500,
        xpToNextLevel: 180,
      },
      rewardSequence: 0,
    });

    const { container } = render(<XpProgressBar />);
    expect(screen.getByText(bandForTotalXp(320).name)).toBeInTheDocument();
    expect(screen.getByText("Lv 2 · 220 XP")).toBeInTheDocument();
    expect(screen.getByText("220 / 400 XP to Lv 3")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open achievements and XP details" })
    ).toHaveAttribute("href", "/achievements");
    expect(container.querySelector("[data-xp-reward-target='true']")).not.toBeNull();
  });
});
