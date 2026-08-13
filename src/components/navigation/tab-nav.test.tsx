import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabNav } from "@/components/navigation/tab-nav";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    transitionTypes,
    ...props
  }: ComponentProps<"a"> & {
    href: string;
    transitionTypes?: string[];
  }) => (
    <a
      href={href}
      data-transition-types={transitionTypes?.join(",")}
      {...props}
    >
      {children}
    </a>
  ),
}));

describe("TabNav", () => {
  afterEach(() => {
    cleanup();
    mockPathname = "/";
  });

  it("renders five app tabs and marks the active tab", () => {
    mockPathname = "/social";
    const { container } = render(<TabNav />);

    expect(screen.getByRole("link", { name: /Insights/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Checklist/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Calendar/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Challenges/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Profile/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Challenges/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(container.querySelectorAll("[data-motion='tab-nav-highlight']")).toHaveLength(1);
  });

  it("routes the checklist tab to checklist path", () => {
    render(<TabNav />);

    expect(screen.getByRole("link", { name: /Checklist/i })).toHaveAttribute(
      "href",
      "/checklist"
    );
  });

  it("uses the five-column grid class when five tabs are present", () => {
    const { container } = render(<TabNav />);
    const tabList = container.querySelector("ul");
    expect(tabList).toHaveClass("grid-cols-5");
  });

  it("names the mobile tab bar so view transitions can freeze it", () => {
    const { container } = render(<TabNav mobile />);
    const nav = container.querySelector("nav");

    expect(nav).not.toBeNull();
    expect((nav as HTMLElement).style.viewTransitionName).toBe("app-shell-tab-nav");
  });

  it("leaves the desktop tab bar unnamed because the header already freezes", () => {
    const { container } = render(<TabNav />);
    const nav = container.querySelector("nav");

    expect(nav).not.toBeNull();
    expect((nav as HTMLElement).style.viewTransitionName).toBe("");
  });

  it("marks tab navigation with directional transition types", () => {
    mockPathname = "/checklist";
    render(<TabNav />);

    expect(screen.getByRole("link", { name: "Insights" })).toHaveAttribute(
      "data-transition-types",
      "nav-back"
    );
    expect(screen.getByRole("link", { name: "Checklist" })).not.toHaveAttribute(
      "data-transition-types"
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "data-transition-types",
      "nav-forward"
    );
  });
});
