import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";

const authStatePath = path.resolve("playwright/.auth/alice.json");

setup("authenticate seeded Alice account", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");

  // Filling before React hydration lets the mount reset the inputs, which
  // showed up intermittently as a submitted form with an empty Email and a
  // populated Password. Re-fill until both values stick.
  await expect(async () => {
    await email.fill("alice@example.com");
    await password.fill("password123");
    await expect(email).toHaveValue("alice@example.com");
    await expect(password).toHaveValue("password123");
  }).toPass({ timeout: 15_000 });

  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/app\/calendar/);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" })
  ).toBeVisible();

  await page.evaluate(() => {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    window.localStorage.setItem("cadence.journey_intro_seen.v1", `${yyyy}-${mm}-${dd}`);
  });
  const startJourney = page.getByRole("button", { name: "Start journey" });
  if (await startJourney.isVisible()) {
    await startJourney.click();
  }

  await mkdir(path.dirname(authStatePath), { recursive: true });
  await page.context().storageState({ path: authStatePath });
});
