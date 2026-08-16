import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("renders four app tabs and marks the active tab", () => {
    mockPathname = "/social";
    const { container } = render(<TabNav />);

    expect(screen.getByRole("link", { name: /Insights/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Planner/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Challenges/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Profile/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Challenges/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(container.querySelectorAll("[data-motion='tab-nav-highlight']")).toHaveLength(1);
  });

  it("routes the planner tab to calendar path", () => {
    render(<TabNav />);

    expect(screen.getByRole("link", { name: /Planner/i })).toHaveAttribute(
      "href",
      "/calendar"
    );
  });

  it("uses the four-column grid class when four tabs are present", () => {
    const { container } = render(<TabNav />);
    const tabList = container.querySelector("ul");
    expect(tabList).toHaveClass("grid-cols-4");
  });

  it("keeps the mobile nav bar 50% transparent so content shows through", () => {
    const { container } = render(<TabNav mobile />);
    const tabList = container.querySelector("ul");
    expect(tabList).toHaveClass("bg-background/50");
    expect(tabList).toHaveClass("supports-[backdrop-filter]:bg-background/50");
    expect(tabList).not.toHaveClass("bg-background/10");
    expect(tabList).not.toHaveClass("bg-background/20");
    expect(tabList).not.toHaveClass("bg-background/25");
  });

  it("marks tab navigation with directional transition types", () => {
    mockPathname = "/calendar";
    render(<TabNav />);

    expect(screen.getByRole("link", { name: "Insights" })).toHaveAttribute(
      "data-transition-types",
      "nav-back"
    );
    expect(screen.getByRole("link", { name: "Planner" })).not.toHaveAttribute(
      "data-transition-types"
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "data-transition-types",
      "nav-forward"
    );
  });

  it("updates the planner highlight immediately on click even if the route lags", () => {
    mockPathname = "/insights";
    render(<TabNav mobile />);

    fireEvent.click(screen.getByRole("link", { name: "Planner" }));

    expect(screen.getByRole("link", { name: "Planner" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Insights" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("follows the real route once pathname catches up after an optimistic click", () => {
    mockPathname = "/insights";
    const { rerender } = render(<TabNav mobile />);

    fireEvent.click(screen.getByRole("link", { name: "Planner" }));
    mockPathname = "/calendar";
    rerender(<TabNav mobile />);

    expect(screen.getByRole("link", { name: "Planner" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    mockPathname = "/social";
    rerender(<TabNav mobile />);

    expect(screen.getByRole("link", { name: "Challenges" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Planner" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
