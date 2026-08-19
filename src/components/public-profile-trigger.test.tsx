import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicProfileTrigger } from "@/components/public-profile-trigger";

const mocks = vi.hoisted(() => ({
  emitOpenPublicProfile: vi.fn(),
}));

vi.mock("@/lib/social/public-profile-events", () => ({
  emitOpenPublicProfile: mocks.emitOpenPublicProfile,
}));

describe("PublicProfileTrigger", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens public profile when subject id is present", async () => {
    const user = userEvent.setup();
    render(
      <PublicProfileTrigger
        subjectUserId="11111111-1111-4111-8111-111111111111"
        buttonLabel="Open Alice profile"
      >
        <span>Alice</span>
      </PublicProfileTrigger>
    );

    await user.click(screen.getByRole("button", { name: "Open Alice profile" }));

    expect(mocks.emitOpenPublicProfile).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("renders static content when subject id is missing", () => {
    render(
      <PublicProfileTrigger
        subjectUserId={null}
        buttonLabel="Open Alice profile"
      >
        <span>Alice</span>
      </PublicProfileTrigger>
    );

    expect(screen.queryByRole("button", { name: "Open Alice profile" })).toBeNull();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});
