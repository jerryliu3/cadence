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

async function postJson(page: Page, url: string, body: unknown) {
  return page.evaluate(
    async ({ target, payload }) => {
      const response = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return {
        status: response.status,
        body: (await response.json()) as {
          code?: string;
          message?: string;
          correlationId?: string;
        },
      };
    },
    { target: url, payload: body }
  );
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

test("planner bridge APIs authenticate before validation", async ({ page }) => {
  await page.goto("/");

  const bulkParser = await postJson(page, "/api/bulk-goals/parse", null);
  const exactCompletion = await postJson(
    page,
    "/api/completions/exact-date",
    null
  );

  expect(bulkParser.status).toBe(400);
  expect(bulkParser.body.code).toBe("validation_failed");
  expect(exactCompletion.status).toBe(400);
  expect(exactCompletion.body.code).toBe("validation_failed");
});

test("bounded progress context returns explicit non-truncated data", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const query = new URLSearchParams({
      asOfDate: today,
      viewDate: today,
      timezone,
    });
    const response = await fetch(`/api/progress/context?${query.toString()}`);
    return {
      status: response.status,
      body: (await response.json()) as {
        schemaVersion?: string;
        summaries?: unknown[];
        truncated?: boolean;
      },
    };
  });

  expect(result.status).toBe(200);
  expect(result.body.schemaVersion).toBe("1");
  expect(result.body.summaries?.length).toBeGreaterThan(0);
  expect(result.body.truncated).toBe(false);
});

test("planner bridge APIs reject unauthenticated callers", async ({ page }) => {
  await page.goto("/");
  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());

  const bulkParser = await postJson(page, "/api/bulk-goals/parse", null);
  const exactCompletion = await postJson(
    page,
    "/api/completions/exact-date",
    null
  );

  expect(bulkParser.status).toBe(401);
  expect(bulkParser.body.code).toBe("authentication_required");
  expect(exactCompletion.status).toBe(401);
  expect(exactCompletion.body.code).toBe("authentication_required");
});

test("targeted recurring bridge mutates only the requested date", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const dayOffset = {
    chromium: 1,
    webkit: 2,
    "mobile-webkit": 3,
  }[testInfo.project.name] ?? 4;

  const result = await page.evaluate(async (offset) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const selectedDate = `${values.year}-${values.month}-${values.day}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const mutation = async (desiredFactState: "present" | "absent") => {
      const response = await fetch("/api/completions/exact-date", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goalId: "10000000-0000-4000-8000-000000000011",
          date: selectedDate,
          desiredFactState,
          timezone,
        }),
      });
      return response.status;
    };

    const createStatus = await mutation("present");
    const query = new URLSearchParams({
      asOfDate: selectedDate,
      viewDate: selectedDate,
      timezone,
    });
    const contextResponse = await fetch(
      `/api/progress/context?${query.toString()}`
    );
    const context = (await contextResponse.json()) as {
      facts?: Array<{ goal_id: string; completed_on: string }>;
    };
    const exactFactCount = (context.facts ?? []).filter(
      (fact) =>
        fact.goal_id === "10000000-0000-4000-8000-000000000011" &&
        fact.completed_on === selectedDate
    ).length;
    const deleteStatus = await mutation("absent");

    return { createStatus, contextStatus: contextResponse.status, exactFactCount, deleteStatus };
  }, dayOffset);

  expect(result).toEqual({
    createStatus: 200,
    contextStatus: 200,
    exactFactCount: 1,
    deleteStatus: 200,
  });
});
