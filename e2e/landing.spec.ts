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
    await expect(page.getByRole("link", { name: "Read why" })).toHaveAttribute(
      "href",
      "#why-goalmaxxing"
    );
    await expect(
      page.getByRole("heading", {
        name: "Most productivity apps stop at today.",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Built for the full loop" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Start in one sentence" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Execute your way" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "See your patterns" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Progress together" })
    ).toBeVisible();
    await expect(page.getByText("AI Coach")).toBeVisible();
    await expect(page.getByText("Recover your rhythm")).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "mailto:hello@goalmaxxing.xyz"
    );
    await expect(page.getByText("7 day streak")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Main navigation" })
    ).toHaveCount(0);
  });

  test("keeps the planner stage stable across week and month", async ({ page }) => {
    await page.goto("/");

    const stage = page.locator("[data-demo-calendar-stage]");
    await expect(page.locator('[data-calendar-view="month"]')).toBeVisible();
    const monthBox = await stage.boundingBox();
    await expect(page.locator('[data-moving-task="past"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-moving-task="future"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("[data-demo-save-plan]")).toBeVisible();
    await expect(page.locator("[data-demo-status]")).toContainText(
      "Saving 2 plan updates...",
      { timeout: 20_000 }
    );
    await expect(page.locator("[data-demo-status]")).toContainText("Plan saved");
    await expect(page.getByText("Today's plan")).toHaveCount(0);

    await expect(page.locator('[data-calendar-view="week"]')).toBeVisible({
      timeout: 20_000,
    });
    const weekBox = await stage.boundingBox();

    expect(weekBox).not.toBeNull();
    expect(monthBox).not.toBeNull();
    expect(Math.abs((weekBox?.height ?? 0) - (monthBox?.height ?? 0))).toBeLessThanOrEqual(
      1
    );
  });

  test("keeps calendar, checklist, and tasks outlines at one height", async ({
    page,
  }) => {
    await page.goto("/");

    const stage = page.getByTestId("planner-surface-stage");
    await expect(stage).toBeVisible();
    const checklistBox = await stage.boundingBox();

    await page.getByRole("tab", { name: "Calendar" }).click();
    const calendarBox = await stage.boundingBox();

    await page.getByRole("tab", { name: "Tasks" }).click();
    const tasksBox = await stage.boundingBox();

    expect(Math.abs((calendarBox?.height ?? 0) - (checklistBox?.height ?? 0))).toBeLessThanOrEqual(
      1
    );
    expect(Math.abs((tasksBox?.height ?? 0) - (checklistBox?.height ?? 0))).toBeLessThanOrEqual(
      1
    );
  });

  test("keeps moved month entries inside their mobile day cells", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.locator("[data-demo-status]")).toContainText("Plan saved", {
      timeout: 20_000,
    });
    await expect(page.locator('[aria-current="date"]')).toHaveAttribute(
      "aria-label",
      /Today/
    );

    const overflows = await page.locator("[data-month-entry]").evaluateAll((entries) =>
      entries.flatMap((entry) => {
        const cell = entry.closest("[data-month-day-cell]");
        if (!(cell instanceof HTMLElement) || !(entry instanceof HTMLElement)) {
          return [];
        }
        const entryRect = entry.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        return entryRect.right > cellRect.right + 1 ||
          entryRect.bottom > cellRect.bottom + 1
          ? [entry.getAttribute("data-month-entry")]
          : [];
      })
    );
    expect(overflows).toEqual([]);
  });

  test("passes baseline WCAG A/AA checks", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
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
