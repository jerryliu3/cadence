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

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" })
  ).toBeVisible();

  await mkdir(path.dirname(authStatePath), { recursive: true });
  await page.context().storageState({ path: authStatePath });
});
