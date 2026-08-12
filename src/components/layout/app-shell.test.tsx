import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

const mocks = vi.hoisted(() => ({
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: mocks.prefetch }),
  usePathname: () => "/calendar",
}));

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
    mocks.prefetch.mockReset();
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

  it("prefetches non-active tab routes after mount", async () => {
    render(
      <AppShell>
        <div>Child content</div>
      </AppShell>
    );

    await waitFor(() => {
      expect(mocks.prefetch).toHaveBeenCalledTimes(4);
    });
    expect(mocks.prefetch).toHaveBeenCalledWith("/insights");
    expect(mocks.prefetch).toHaveBeenCalledWith("/checklist");
    expect(mocks.prefetch).toHaveBeenCalledWith("/social");
    expect(mocks.prefetch).toHaveBeenCalledWith("/settings");
  });
});
