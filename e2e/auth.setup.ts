import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { bootstrapAuthSession } from "./auth-session";

const authStatePath = path.resolve("playwright/.auth/alice.json");

setup("authenticate seeded Alice account", async ({ page }) => {
  await bootstrapAuthSession(page, {
    email: "alice@example.com",
    password: "password123",
    markJourneyIntroSeen: true,
  });

  await mkdir(path.dirname(authStatePath), { recursive: true });
  await page.context().storageState({ path: authStatePath });
});
