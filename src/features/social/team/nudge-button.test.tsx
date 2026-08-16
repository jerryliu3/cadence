import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NudgeButton } from "./nudge-button";

const mocks = vi.hoisted(() => ({
  sendTeamNudge: vi.fn(),
}));

vi.mock("@/features/social/data", () => ({
  sendTeamNudge: mocks.sendTeamNudge,
}));

describe("NudgeButton", () => {
  it("limits custom user text to 90 characters", async () => {
    mocks.sendTeamNudge.mockResolvedValue(undefined);

    render(
      <NudgeButton
        partnerId="partner-1"
        optionalMessage={"x".repeat(100)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Send nudge" }));

    await waitFor(() => {
      expect(mocks.sendTeamNudge).toHaveBeenCalledWith({
        toUserId: "partner-1",
        kind: "custom",
        message: `Your partner sent a nudge to keep momentum going. ${"x".repeat(
          90
        )}`,
      });
    });
  });
});
