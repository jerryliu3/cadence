import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("loads the seeded authenticated planner shell", async ({ page }, testInfo) => {
  await page.goto("/app");

  const mainNav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    mainNav
  ).toBeVisible();
  await expect(mainNav.getByRole("link", { name: "Planner" })).toBeVisible();
  const insightsLink = mainNav.getByRole("link", { name: "Insights" });
  const socialLink = mainNav.getByRole("link", { name: "Social" });
  const insightsCount = await insightsLink.count();
  const socialCount = await socialLink.count();

  expect(insightsCount + socialCount).toBeGreaterThan(0);

  if (insightsCount > 0) {
    await expect(insightsLink.first()).toBeVisible();
  } else {
    await expect(socialLink.first()).toBeVisible();
  }
  await expect(mainNav.getByRole("link", { name: /Settings|Profile/ })).toBeVisible();
  await expect(page.getByText("Loading your goals...")).toHaveCount(0);

  if (testInfo.project.name === "mobile-webkit") {
    expect(page.viewportSize()?.width).toBeLessThan(500);
  }
});

test("explicit Calendar surface does not eagerly load checklist context", async ({
  page,
}) => {
  let progressContextRequests = 0;
  await page.route("**/api/progress/context**", async (route) => {
    progressContextRequests += 1;
    await route.continue();
  });

  await page.goto("/app/calendar?surface=calendar");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Planner" })).toBeVisible();
  await expect(page).toHaveURL(/\/calendar/);
  await page.waitForTimeout(750);
  expect(progressContextRequests).toBe(0);
});

test("legacy day links redirect into calendar route", async ({
  page,
}) => {
  await page.goto("/app?day=2026-08-04");
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page).toHaveURL(/month=2026-08/);
});

test("public root route renders landing page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /plan your goals/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to app" })).toBeVisible();
});

test("goal creation entry stays under the /app shell", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("link", { name: /new goal \+/i }).first().click();
  await expect(page).toHaveURL(/\/app\/goals\/new/);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" })
  ).toBeVisible();
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

  const violationsExcludingKnownViewportTradeoff = results.violations.filter(
    (violation) => violation.id !== "meta-viewport"
  );
  expect(violationsExcludingKnownViewportTradeoff).toEqual([]);
});
