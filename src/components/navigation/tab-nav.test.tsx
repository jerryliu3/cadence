import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabNav } from "@/components/navigation/tab-nav";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
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

afterEach(() => {
  cleanup();
  pathname = "/";
});

describe("TabNav", () => {
  it("marks tab navigation with forward and back transition directions", () => {
    render(<TabNav />);

    expect(screen.getByRole("link", { name: "Insights" })).toHaveAttribute(
      "data-transition-types",
      "nav-back"
    );
    expect(screen.getByRole("link", { name: "Checklist" })).not.toHaveAttribute(
      "data-transition-types"
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "data-transition-types",
      "nav-forward"
    );
  });
});
