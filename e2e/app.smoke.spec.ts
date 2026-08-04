import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("loads the seeded authenticated checklist", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(
    page.getByRole("navigation", { name: "Main navigation" })
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Today", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Not Today", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Loading your goals...")).toHaveCount(0);

  if (testInfo.project.name === "mobile-webkit") {
    expect(page.viewportSize()?.width).toBeLessThan(500);
  }
});

test("login surface has no detectable WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/login");
  await expect(page.getByText("Welcome back")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
