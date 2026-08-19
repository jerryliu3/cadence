import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserAvatar } from "@/components/user-avatar";

const mocks = vi.hoisted(() => ({
  emitOpenPublicProfile: vi.fn(),
}));

vi.mock("@/lib/social/public-profile-events", () => ({
  emitOpenPublicProfile: mocks.emitOpenPublicProfile,
}));

describe("UserAvatar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps initials fallback available when avatar url is provided", () => {
    render(
      <UserAvatar
        avatarUrl="https://example.supabase.co/storage/v1/object/public/avatars/u/avatar.jpg"
        displayName="Alice"
        username="alice"
      />
    );

    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("falls back to initials from display name", () => {
    render(<UserAvatar avatarUrl={null} displayName="Alice Example" username="alice" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("falls back to unknown initials when profile labels are missing", () => {
    render(<UserAvatar avatarUrl={null} displayName={null} username={null} />);
    expect(screen.getByText("??")).toBeInTheDocument();
  });

  it("emits profile open event when interactive avatar is pressed", async () => {
    const user = userEvent.setup();
    render(
      <UserAvatar
        avatarUrl={null}
        displayName="Alice"
        username="alice"
        profileSubjectUserId="11111111-1111-4111-8111-111111111111"
      />
    );

    await user.click(screen.getByRole("button", { name: "Alice profile" }));

    expect(mocks.emitOpenPublicProfile).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
  });
});
