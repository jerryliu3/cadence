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
    expect(screen.getByRole("link", { name: /Social/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Social/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("uses the five-column grid class when five tabs are present", () => {
    const { container } = render(<TabNav />);
    const tabList = container.querySelector("ul");
    expect(tabList).toHaveClass("grid-cols-5");
  });
});
