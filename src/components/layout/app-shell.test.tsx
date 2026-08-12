import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

const cacheScopeMock = vi.hoisted(() => ({
  setScope: vi.fn(),
}));
vi.mock("@/components/navigation/tab-nav", () => ({
  TabNav: ({ mobile = false }: { mobile?: boolean }) => (
    <nav data-testid={mobile ? "tab-nav-mobile" : "tab-nav-desktop"} />
  ),
}));

vi.mock("@/components/xp/xp-level-badge", () => ({
  XpLevelBadge: () => <span>XP Badge</span>,
}));

vi.mock("@/lib/cache/tab-data-cache", () => ({
  setTabDataCacheScope: (scope: string) => cacheScopeMock.setScope(scope),
}));
describe("AppShell", () => {
  afterEach(() => {
    cleanup();
    cacheScopeMock.setScope.mockReset();
  });

  it("renders the `New Goal +` header link", () => {
    render(
      <AppShell userId="user-1">
        <div>Child content</div>
      </AppShell>
    );

    const newGoalLink = screen.getByRole("link", { name: /new goal \+/i });
    expect(newGoalLink).toHaveAttribute("href", "/goals/new");
  });

  it("scopes tab data cache by authenticated user", () => {
    render(
      <AppShell userId="user-1">
        <div>Child content</div>
      </AppShell>
    );

    expect(cacheScopeMock.setScope).toHaveBeenCalledWith("user-1");
  });

  it("renders route children", () => {
    render(
      <AppShell userId="user-1">
        <div>Child content</div>
      </AppShell>
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
  });
});
