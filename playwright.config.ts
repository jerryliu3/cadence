import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const webServerUrl =
  process.env.PLAYWRIGHT_WEB_SERVER_URL ?? `${baseURL}/login`;
const authStatePath = "playwright/.auth/alice.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath,
      },
    },
    {
      name: "webkit",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Safari"],
        storageState: authStatePath,
      },
    },
    {
      name: "mobile-webkit",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["iPhone 13"],
        storageState: authStatePath,
      },
    },
  ],
  webServer: {
    command: process.env.CI
      ? `pnpm exec next start --hostname 127.0.0.1 --port ${port}`
      : `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: webServerUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      // Present for push-dispatch routes; not required for boot outside Vercel prod.
      CRON_SECRET: process.env.CRON_SECRET ?? "playwright-cron-secret",
    },
  },
});
