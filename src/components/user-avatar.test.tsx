import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UserAvatar } from "@/components/user-avatar";

describe("UserAvatar", () => {
  afterEach(() => {
    cleanup();
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
});
