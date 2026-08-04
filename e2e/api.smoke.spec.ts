import { expect, test, type Page } from "@playwright/test";

async function postInvalidPushSubscription(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/push/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(null),
    });

    return {
      status: response.status,
      body: (await response.json()) as { error?: string },
    };
  });
}

test("API integration preserves authenticated validation order", async ({
  page,
}) => {
  await page.goto("/");
  const response = await postInvalidPushSubscription(page);

  expect(response).toEqual({
    status: 400,
    body: { error: "Invalid push subscription." },
  });
});

test("API integration rejects an unauthenticated mutation", async ({ page }) => {
  await page.goto("/");
  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());

  const response = await postInvalidPushSubscription(page);

  expect(response).toEqual({
    status: 401,
    body: { error: "Unauthorized." },
  });
});
