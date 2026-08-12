import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabNav } from "@/components/navigation/tab-nav";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("TabNav", () => {
  afterEach(() => {
    cleanup();
    mockPathname = "/";
  });

  it("renders five app tabs and marks the active tab", () => {
    mockPathname = "/social";
    render(<TabNav />);

    expect(screen.getByRole("link", { name: /Insights/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Checklist/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Calendar/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Challenges/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Profile/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Challenges/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
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
});
