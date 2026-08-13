import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestXpRefresh } from "@/lib/xp/events";
import { XpLevelBadge } from "./xp-level-badge";

const toastSuccessMock = vi.fn();
const celebrateMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock("@/components/xp/xp-reward-provider", () => ({
  useXpReward: () => ({
    celebrate: celebrateMock,
  }),
}));

describe("XpLevelBadge", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("retries award acknowledgement without duplicate toast spam", async () => {
    const awardId = "a2785c72-5d33-41ec-bde8-a32976132f3d";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            profile: {
              totalXp: 120,
              currentLevel: 2,
              nextLevel: 3,
              xpToNextLevel: 130,
            },
            pendingAwards: [
              {
                awardId,
                level: 2,
                title: "Level 2 unlocked",
                description: "You reached level 2.",
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "temporary_error" }), {
          status: 500,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            profile: {
              totalXp: 120,
              currentLevel: 2,
              nextLevel: 3,
              xpToNextLevel: 130,
            },
            pendingAwards: [
              {
                awardId,
                level: 2,
                title: "Level 2 unlocked",
                description: "You reached level 2.",
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: "1",
            acknowledged: true,
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<XpLevelBadge />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    requestXpRefresh();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    const acknowledgeCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/xp/awards/acknowledge"
    );
    expect(acknowledgeCalls).toHaveLength(2);
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
  });

  it("aligns level and progress lines from the same left edge", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          profile: {
            totalXp: 220,
            currentLevel: 2,
            nextLevel: 3,
            xpToNextLevel: 30,
          },
          pendingAwards: [],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<XpLevelBadge />);

    const levelLine = await screen.findByText("Lv 2 · 220 XP");
    const progressLine = await screen.findByText("30 XP to Lv 3");
    const wrapper = levelLine.closest("div");
    expect(wrapper).not.toBeNull();
    expect(progressLine).toBeInTheDocument();
    expect(wrapper?.className).toContain("items-start");
  });

  it("flies a reward to the badge only when XP increases", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            profile: {
              totalXp: 100,
              currentLevel: 1,
              nextLevel: 2,
              xpToNextLevel: 20,
            },
            pendingAwards: [],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            profile: {
              totalXp: 125,
              currentLevel: 2,
              nextLevel: 3,
              xpToNextLevel: 125,
            },
            pendingAwards: [],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            profile: {
              totalXp: 100,
              currentLevel: 1,
              nextLevel: 2,
              xpToNextLevel: 20,
            },
            pendingAwards: [],
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<XpLevelBadge />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    const target = container.querySelector("[data-xp-reward-target='true']");
    expect(target).not.toBeNull();
    vi.spyOn(target as HTMLElement, "getBoundingClientRect").mockReturnValue({
      top: 8,
      left: 300,
      width: 80,
      height: 32,
      bottom: 40,
      right: 380,
      x: 300,
      y: 8,
      toJSON: () => ({}),
    });
    const sourceRect = { top: 220, left: 24, width: 40, height: 40 };

    requestXpRefresh({
      reason: "completion",
      desiredFactState: "present",
      sourceRect,
    });

    await waitFor(() => {
      expect(celebrateMock).toHaveBeenCalledWith({
        sourceRect,
        targetRect: {
          top: 8,
          left: 300,
          width: 80,
          height: 32,
        },
      });
    });

    requestXpRefresh({
      reason: "completion",
      desiredFactState: "absent",
      sourceRect,
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    expect(celebrateMock).toHaveBeenCalledTimes(1);
  });
});
