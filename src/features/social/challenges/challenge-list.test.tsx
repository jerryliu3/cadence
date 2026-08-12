import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeList } from "@/features/social/challenges/challenge-list";
import type { SocialChallenge } from "@/features/social/types";

const fetchSocialChallengesMock = vi.fn();
const fetchSocialChallengeDetailMock = vi.fn();
const joinSocialChallengeMock = vi.fn();
const leaveSocialChallengeMock = vi.fn();

vi.mock("@/features/social/data", () => ({
  fetchSocialChallenges: (...args: unknown[]) => fetchSocialChallengesMock(...args),
  fetchSocialChallengeDetail: (...args: unknown[]) =>
    fetchSocialChallengeDetailMock(...args),
  joinSocialChallenge: (...args: unknown[]) => joinSocialChallengeMock(...args),
  leaveSocialChallenge: (...args: unknown[]) => leaveSocialChallengeMock(...args),
}));

function makeChallenge(id: string, title: string): SocialChallenge {
  return {
    id,
    slug: title.toLowerCase().replaceAll(" ", "-"),
    title,
    description: `${title} description`,
    status: "active",
    subjectKind: "user",
    metric: "total_xp",
    metricTrackKey: null,
    targetValue: 1000,
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-08-31T23:59:59.000Z",
    rewardXp: 100,
    maxParticipants: null,
    participantCount: 10,
    viewerJoined: true,
    viewerProgress: 250,
    viewerCompletedAt: null,
    viewerAwardedAt: null,
  };
}

async function nextTick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ChallengeList", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("switches selected challenges without reloading the roster", async () => {
    const challenges = [
      makeChallenge("11111111-1111-4111-8111-111111111111", "Weekly XP Sprint"),
      makeChallenge("22222222-2222-4222-8222-222222222222", "Cohort Health Push"),
    ];
    fetchSocialChallengesMock.mockResolvedValue({
      schemaVersion: "1",
      items: challenges,
    });
    fetchSocialChallengeDetailMock.mockResolvedValue({
      schemaVersion: "1",
      item: challenges[0],
    });

    render(<ChallengeList />);
    expect(
      await screen.findByRole("button", { name: /Weekly XP Sprint/i })
    ).toBeInTheDocument();
    await nextTick();

    expect(fetchSocialChallengesMock).toHaveBeenCalledTimes(1);
    expect(fetchSocialChallengeDetailMock).toHaveBeenCalledTimes(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Cohort Health Push/i }));
    expect(screen.getByText("Cohort Health Push description")).toBeInTheDocument();
    await nextTick();

    expect(fetchSocialChallengesMock).toHaveBeenCalledTimes(1);
    expect(fetchSocialChallengeDetailMock).toHaveBeenCalledTimes(0);
  });
});
