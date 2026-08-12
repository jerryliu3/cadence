import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("loads the seeded authenticated checklist", async ({ page }, testInfo) => {
  await page.goto("/");

  const mainNav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    mainNav
  ).toBeVisible();
  await expect(mainNav.getByRole("link", { name: "Checklist" })).toBeVisible();
  const insightsLink = mainNav.getByRole("link", { name: "Insights" });
  const calendarLink = mainNav.getByRole("link", { name: "Calendar" });
  const insightsCount = await insightsLink.count();
  const calendarCount = await calendarLink.count();

  expect(insightsCount + calendarCount).toBeGreaterThan(0);

  if (insightsCount > 0) {
    await expect(insightsLink.first()).toBeVisible();
  } else {
    await expect(calendarLink.first()).toBeVisible();
  }
  await expect(mainNav.getByRole("link", { name: /Settings|Profile/ })).toBeVisible();
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
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Checklist" })).toBeVisible();
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
