import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LandingPage } from "@/components/landing/landing-page";

describe("LandingPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps only create account in header actions", () => {
    render(<LandingPage />);

    const nav = screen.getByRole("navigation", { name: "Landing actions" });
    expect(within(nav).getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/signup"
    );
    expect(within(nav).queryByRole("link", { name: /log in/i })).toBeNull();
  });

  it("uses go to app as the hero primary CTA", () => {
    render(<LandingPage />);

    const heroActions = screen.getByTestId("hero-primary-actions");
    expect(within(heroActions).getByRole("link", { name: /go to app/i })).toHaveAttribute(
      "href",
      "/app"
    );
    expect(within(heroActions).queryByRole("link", { name: /create account/i })).toBeNull();
  });

  it("emphasizes long-term outcomes and renders seeded planner demo", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: /short-term and long-term goals, not another to-do list or daily habit tracker/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("What your week looks like")).toBeInTheDocument();
    expect(screen.getByText("Seeded weekly plan")).toBeInTheDocument();
  });
});
