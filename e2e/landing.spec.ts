import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("marketing landing", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows hero CTAs and no authenticated app shell", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: /achieve your goals using one focused system/i,
      })
    ).toBeVisible();

    const signupLink = page.getByRole("link", { name: "Create account" }).first();
    await expect(signupLink).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("link", { name: "Log in" }).first()).toHaveAttribute(
      "href",
      "/login"
    );
    await expect(page.getByRole("link", { name: "Go to app" })).toHaveAttribute(
      "href",
      "/app"
    );
    await expect(page.getByRole("link", { name: "Read story" })).toHaveAttribute(
      "href",
      "#why-goalmaxxing"
    );
    await expect(
      page.getByRole("heading", {
        name: "Most productivity apps stop at today.",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" })
    ).toHaveCount(0);
  });

  test("passes baseline WCAG A/AA checks", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("renders recovery not-found page for stale legacy routes", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { name: "This page moved." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to app" })).toHaveAttribute(
      "href",
      "/app"
    );
    await expect(page.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/"
    );
  });
});
