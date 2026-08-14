import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

let mockPathname = "/";
let mockSearch = "";

const cacheScopeMock = vi.hoisted(() => ({
  setScope: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/components/navigation/tab-nav", () => ({
  TabNav: ({ mobile = false }: { mobile?: boolean }) => (
    <nav data-testid={mobile ? "tab-nav-mobile" : "tab-nav-desktop"} />
  ),
}));

vi.mock("@/components/xp/xp-level-badge", () => ({
  XpLevelBadge: () => <span>XP Badge</span>,
}));

vi.mock("@/components/xp/xp-progress-bar", () => ({
  XpProgressBar: () => <span>XP Progress</span>,
}));

vi.mock("@/components/xp/altitude-backdrop", () => ({
  AltitudeBackdrop: () => <div data-testid="altitude-backdrop" />,
}));

vi.mock("@/components/xp/xp-profile-provider", () => ({
  XpProfileProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/cache/tab-data-cache", () => ({
  setTabDataCacheScope: (scope: string) => cacheScopeMock.setScope(scope),
}));

const emptyDuoProps = {
  duoState: {
    activePartner: null,
    pendingInvite: null,
  },
  duoAvailability: "ready" as const,
  initialDuoScopePreference: null,
} as const;

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
    cacheScopeMock.setScope.mockReset();
    mockPathname = "/";
    mockSearch = "";
  });

  it("renders the `New Goal +` header link", () => {
    render(
      <AppShell userId="user-1" {...emptyDuoProps}>
        <div>Child content</div>
      </AppShell>
    );

    const newGoalLink = screen.getByRole("link", { name: /new goal \+/i });
    expect(newGoalLink).toHaveAttribute("href", "/goals/new?returnTo=%2F");
  });

  it("includes the current route in the new goal returnTo query", () => {
    mockPathname = "/social";
    mockSearch = "tab=challenges&sort=recent";

    render(
      <AppShell userId="user-1" {...emptyDuoProps}>
        <div>Child content</div>
      </AppShell>
    );

    const newGoalLink = screen.getByRole("link", { name: /new goal \+/i });
    expect(newGoalLink).toHaveAttribute(
      "href",
      "/goals/new?returnTo=%2Fsocial%3Ftab%3Dchallenges%26sort%3Drecent"
    );
  });

  it("scopes tab data cache by authenticated user", () => {
    render(
      <AppShell userId="user-1" {...emptyDuoProps}>
        <div>Child content</div>
      </AppShell>
    );

    expect(cacheScopeMock.setScope).toHaveBeenCalledWith("user-1");
  });

  it("renders route children", () => {
    render(
      <AppShell userId="user-1" {...emptyDuoProps}>
        <div>Child content</div>
      </AppShell>
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
  });
});
