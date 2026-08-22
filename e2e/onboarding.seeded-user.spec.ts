import { expect, test, type Page } from "@playwright/test";

const ONBOARDING_DEMO_USER = {
  email: "dana@example.com",
  password: "password123",
};

const ONBOARDING_DEFAULT_GOAL_TITLES = [
  "Create your Goalmaxxing account",
  "Create your first goal",
  "Invite your first teammate",
] as const;

const JOURNEY_ONBOARDING_COMPLETED_KEY = "cadence.journey_onboarding_completed.v1";

async function signIn(page: Page, emailAddress: string, passwordValue: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());

  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");
  await expect(async () => {
    await email.fill(emailAddress);
    await password.fill(passwordValue);
    await expect(email).toHaveValue(emailAddress);
    await expect(password).toHaveValue(passwordValue);
  }).toPass({ timeout: 15_000 });

  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" })
  ).toBeVisible();
}

test("seeded onboarding demo account exposes default goals and pending team invite", async ({
  page,
}) => {
  await signIn(page, ONBOARDING_DEMO_USER.email, ONBOARDING_DEMO_USER.password);

  // Keep this test API-focused by bypassing intro modal interactions.
  await page.evaluate((storageKey) => {
    window.localStorage.setItem(storageKey, "done");
  }, JOURNEY_ONBOARDING_COMPLETED_KEY);

  const verification = await page.evaluate(async (expectedGoalTitles) => {
    const today = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const scopeMonth = today.slice(0, 7);

    const plannerResponse = await fetch(
      `/api/planner/context?scopeMonth=${scopeMonth}`
    );
    const plannerBody = (await plannerResponse.json()) as {
      goalTitles?: Record<string, string>;
    };

    const teamResponse = await fetch("/api/social/team");
    const teamBody = (await teamResponse.json()) as {
      items?: Array<{
        status: string;
        isIncoming: boolean;
      }>;
    };

    return {
      plannerStatus: plannerResponse.status,
      goalTitles: Object.values(plannerBody.goalTitles ?? {}),
      expectedGoalTitles,
      matchedGoalTitles: Object.values(plannerBody.goalTitles ?? {}).filter((goalTitle) =>
        expectedGoalTitles.includes(goalTitle)
      ),
      teamStatus: teamResponse.status,
      teamItems: teamBody.items ?? [],
    };
  }, [...ONBOARDING_DEFAULT_GOAL_TITLES]);

  expect(verification.plannerStatus).toBe(200);
  expect(
    verification.expectedGoalTitles.every((goalTitle) =>
      verification.goalTitles.includes(goalTitle)
    )
  ).toBe(true);
  expect(verification.matchedGoalTitles).toHaveLength(
    ONBOARDING_DEFAULT_GOAL_TITLES.length
  );

  expect(verification.teamStatus).toBe(200);
  expect(
    verification.teamItems.some(
      (item) => item.status === "pending" && item.isIncoming === true
    )
  ).toBe(true);
});
