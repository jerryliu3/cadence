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

vi.mock("@/components/layout/tab-keepalive-host", () => ({
  KEEPALIVE_TAB_PATHS: ["/calendar", "/checklist", "/insights", "/social"],
  TabKeepaliveHost: ({ activePath }: { activePath: string }) => (
    <div data-testid="tab-keepalive-host" data-active-path={activePath} />
  ),
}));

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
    mocks.prefetch.mockReset();
  });

  it("renders both mobile and desktop `New Goal +` links in the header", () => {
    render(
      <AppShell socialEnabled>
        <div>Child content</div>
      </AppShell>
    );

    const newGoalLinks = screen.getAllByRole("link", { name: /new goal \+/i });
    expect(newGoalLinks).toHaveLength(2);
    newGoalLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/goals/new");
    });
  });

  it("prefetches non-active tab routes after mount", async () => {
    render(
      <AppShell socialEnabled>
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

  it("renders keepalive host for core tab routes", () => {
    render(
      <AppShell socialEnabled>
        <div>Child content</div>
      </AppShell>
    );

    expect(screen.getByTestId("tab-keepalive-host")).toHaveAttribute(
      "data-active-path",
      "/calendar"
    );
    expect(screen.queryByText("Child content")).not.toBeInTheDocument();
  });
});
