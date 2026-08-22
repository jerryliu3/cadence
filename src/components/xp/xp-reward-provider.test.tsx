import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useXpReward,
  XpRewardProvider,
} from "@/components/xp/xp-reward-provider";

afterEach(() => {
  cleanup();
});

function RewardHarness() {
  const { celebrate } = useXpReward();
  return (
    <button
      type="button"
      onClick={() =>
        celebrate({
          sourceRect: { top: 100, left: 40, width: 40, height: 40 },
          targetRect: { top: 10, left: 280, width: 90, height: 32 },
        })
      }
    >
      Celebrate
    </button>
  );
}

describe("XpRewardProvider", () => {
  it("keeps reward celebrate non-blocking without rendering particles", () => {
    const { container } = render(
      <XpRewardProvider>
        <RewardHarness />
      </XpRewardProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Celebrate" }));

    expect(container.querySelectorAll("[data-reward-burst]")).toHaveLength(0);
    expect(
      container.querySelector("[data-motion='xp-reward-overlay']")
    ).toHaveClass("pointer-events-none");
  });
});
