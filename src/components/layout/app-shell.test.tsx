import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

vi.mock("@/components/navigation/tab-nav", () => ({
  TabNav: ({ mobile = false }: { mobile?: boolean }) => (
    <nav data-testid={mobile ? "tab-nav-mobile" : "tab-nav-desktop"} />
  ),
}));

vi.mock("@/components/xp/xp-level-badge", () => ({
  XpLevelBadge: () => <span>XP Badge</span>,
}));

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the `New Goal +` header link", () => {
    render(
      <AppShell>
        <div>Child content</div>
      </AppShell>
    );

    const newGoalLink = screen.getByRole("link", { name: /new goal \+/i });
    expect(newGoalLink).toHaveAttribute("href", "/goals/new");
  });

});
