import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useXpReward,
  XpRewardProvider,
} from "@/components/xp/xp-reward-provider";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
  it("renders a pointer-transparent star flight for a reward", async () => {
    const { container } = render(
      <XpRewardProvider>
        <RewardHarness />
      </XpRewardProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Celebrate" }));

    await waitFor(() => {
      expect(container.querySelectorAll("[data-reward-burst]")).toHaveLength(5);
    });
    expect(
      container.querySelector("[data-motion='xp-reward-overlay']")
    ).toHaveClass("pointer-events-none");
  });
});
