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
    page.getByRole("tab", { name: "Past", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Calendar", exact: true })
  ).toBeVisible();
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

  await page.goto("/?tab=calendar");
  await expect(
    page.getByRole("tab", { name: "Calendar", exact: true })
  ).toBeVisible();
  await expect(page).toHaveURL(/tab=calendar/);
  await page.waitForLoadState("networkidle");
  expect(progressContextRequests).toBe(0);
});

test("planner shell normalizes URL and preserves history navigation", async ({
  page,
}) => {
  await page.goto("/?day=2026-08-04");
  await expect(page).toHaveURL(/tab=calendar/);
  await expect(page).toHaveURL(/month=2026-08/);
  await expect(page).toHaveURL(/day=2026-08-04/);

  await page.getByRole("tab", { name: "Past", exact: true }).click();
  await expect(page).toHaveURL(/tab=not-today/);
  // Keep the selected calendar day in the URL so returning to calendar
  // restores the previous day context.
  await expect(page).toHaveURL(/day=2026-08-04/);

  await page.goBack();
  await expect(page).toHaveURL(/tab=calendar/);
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
