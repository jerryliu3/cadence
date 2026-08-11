import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const APP_TAB_LABELS = ["Insights", "Checklist", "Social", "Settings"] as const;

test("loads the seeded authenticated checklist", async ({ page }, testInfo) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeVisible();
  for (const label of APP_TAB_LABELS) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Loading your goals...")).toHaveCount(0);

  if (testInfo.project.name === "mobile-webkit") {
    expect(page.viewportSize()?.width).toBeLessThan(500);
  }
});

test("direct calendar URL does not eagerly load checklist context", async ({
  page,
}) => {
  let progressContextRequests = 0;
  await page.route("**/api/progress/context**", async (route) => {
    progressContextRequests += 1;
    await route.continue();
  });

  await page.goto("/calendar");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/calendar/);
  await page.waitForTimeout(750);
  expect(progressContextRequests).toBe(0);
});

test("legacy day links redirect into calendar route", async ({
  page,
}) => {
  await page.goto("/?day=2026-08-04");
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page).toHaveURL(/month=2026-08/);
  await expect(page).toHaveURL(/day=2026-08-04/);
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
