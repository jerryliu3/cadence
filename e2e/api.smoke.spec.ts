import { expect, test, type Page } from "@playwright/test";

// Publishing a plan moves the owner-wide schedule digest, and one test below
// ("reports missing planner item with matching digest") needs the digest it
// read to still be current when it posts. Run this file serially so a publish
// cannot land inside that window.
test.describe.configure({ mode: "serial" });

async function gotoAuthenticatedApp(page: Page) {
  await page.goto("/app");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" })
  ).toBeVisible();
}

async function postInvalidPushSubscription(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/push/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(null),
    });

    return {
      status: response.status,
      body: (await response.json()) as {
        code?: string;
        message?: string;
        correlationId?: string;
      },
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
  await gotoAuthenticatedApp(page);
  const response = await postInvalidPushSubscription(page);

  expect(response.status).toBe(400);
  expect(response.body.code).toBe("validation_failed");
  expect(response.body.correlationId).toEqual(expect.any(String));
});

test("API integration rejects an unauthenticated mutation", async ({ page }) => {
  await page.goto("/login");
  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());

  const response = await postInvalidPushSubscription(page);

  expect(response.status).toBe(401);
  expect(response.body.code).toBe("authentication_required");
  expect(response.body.correlationId).toEqual(expect.any(String));
});

test("planner bridge APIs authenticate before validation", async ({ page }) => {
  await gotoAuthenticatedApp(page);

  const bulkParser = await postJson(page, "/api/bulk-goals/parse", null);
  const exactCompletion = await postJson(
    page,
    "/api/completions",
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
  await gotoAuthenticatedApp(page);
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
  await page.goto("/login");
  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());

  const bulkParser = await postJson(page, "/api/bulk-goals/parse", null);
  const exactCompletion = await postJson(
    page,
    "/api/completions",
    null
  );

  expect(bulkParser.status).toBe(401);
  expect(bulkParser.body.code).toBe("authentication_required");
  expect(exactCompletion.status).toBe(401);
  expect(exactCompletion.body.code).toBe("authentication_required");
});

test("planner reset rejects stale digest expectations", async ({ page }) => {
  await gotoAuthenticatedApp(page);
  const result = await page.evaluate(async () => {
    const fallbackDigest =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const dateParts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
      })
        .formatToParts(new Date())
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const scopeMonth = `${dateParts.year}-${dateParts.month}`;
    const contextResponse = await fetch(
      `/api/planner/context?scopeMonth=${scopeMonth}`
    );
    const contextBody = (await contextResponse.json()) as {
      revisions?: { scheduleDigest?: string | null };
    };
    const digest =
      typeof contextBody.revisions?.scheduleDigest === "string" &&
      contextBody.revisions.scheduleDigest.length === 64
        ? contextBody.revisions.scheduleDigest
        : fallbackDigest;
    const staleDigest = `${digest[0] === "a" ? "b" : "a"}${digest.slice(1)}`;
    const resetResponse = await fetch("/api/planner/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scopeMonth,
        expectedDigest: staleDigest,
      }),
    });
    return {
      contextStatus: contextResponse.status,
      resetStatus: resetResponse.status,
      resetBody: (await resetResponse.json()) as { code?: string },
    };
  });

  expect(result.contextStatus).toBe(200);
  expect(result.resetStatus).toBe(409);
  expect(result.resetBody.code).toBe("stale_revision");
});

test("planner completion bridge rejects stale item expectation digests first", async ({
  page,
}) => {
  await gotoAuthenticatedApp(page);
  const result = await page.evaluate(async () => {
    const fallbackDigest =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(now)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const selectedDate = `${values.year}-${values.month}-${values.day}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const scopeMonth = selectedDate.slice(0, 7);
    const contextResponse = await fetch(
      `/api/planner/context?scopeMonth=${scopeMonth}`
    );
    const contextBody = (await contextResponse.json()) as {
      revisions?: { scheduleDigest?: string | null };
    };
    const digest =
      typeof contextBody.revisions?.scheduleDigest === "string" &&
      contextBody.revisions.scheduleDigest.length === 64
        ? contextBody.revisions.scheduleDigest
        : fallbackDigest;
    const staleDigest = `${digest[0] === "a" ? "b" : "a"}${digest.slice(1)}`;
    const response = await fetch("/api/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goalId: "10000000-0000-4000-8000-000000000011",
        date: selectedDate,
        desiredFactState: "present",
        timezone,
        plannerItemExpectation: {
          itemId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          expectedDigest: staleDigest,
        },
      }),
    });
    return {
      status: response.status,
      body: (await response.json()) as { code?: string },
    };
  });

  expect(result.status).toBe(409);
  expect(result.body.code).toBe("stale_revision");
});

test("planner completion bridge reports missing planner item with matching digest", async ({
  page,
}) => {
  await gotoAuthenticatedApp(page);
  const result = await page.evaluate(async () => {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(now)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const selectedDate = `${values.year}-${values.month}-${values.day}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const scopeMonth = selectedDate.slice(0, 7);
    const contextResponse = await fetch(
      `/api/planner/context?scopeMonth=${scopeMonth}`
    );
    const contextBody = (await contextResponse.json()) as {
      revisions?: { scheduleDigest?: string | null };
    };
    const digest =
      typeof contextBody.revisions?.scheduleDigest === "string" &&
      contextBody.revisions.scheduleDigest.length === 64
        ? contextBody.revisions.scheduleDigest
        : null;
    if (!digest) {
      return {
        contextStatus: contextResponse.status,
        status: 0,
        body: { code: "missing_digest" },
      };
    }
    const response = await fetch("/api/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goalId: "10000000-0000-4000-8000-000000000011",
        date: selectedDate,
        desiredFactState: "present",
        timezone,
        plannerItemExpectation: {
          itemId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          expectedDigest: digest,
        },
      }),
    });
    return {
      contextStatus: contextResponse.status,
      status: response.status,
      body: (await response.json()) as { code?: string },
    };
  });

  expect(result.contextStatus).toBe(200);
  expect(result.body.code).not.toBe("missing_digest");
  expect(result.status).toBe(404);
  expect(result.body.code).toBe("planner_item_not_found");
});

test("targeted recurring bridge mutates only the requested date", async ({
  page,
}, testInfo) => {
  await gotoAuthenticatedApp(page);
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
      const response = await fetch("/api/completions", {
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

test("planner save publishes a multi-month date window in one request", async ({
  page,
}) => {
  await gotoAuthenticatedApp(page);
  const result = await page.evaluate(async () => {
    type Ctx = {
      asOfDate: string;
      timezone: string;
      revisions: { scheduleDigest: string };
      preview: {
        generationInputHash: string;
        eligibilityMode: string;
        preserveExistingAssignments: boolean;
        solver: { publishable: boolean; confirmationRequired: boolean };
      } | null;
    };
    type PreviewBody = {
      preview: Ctx["preview"];
    };
    const loadContext = async (scopeMonth: string) => {
      const response = await fetch(
        `/api/planner/context?scopeMonth=${scopeMonth}`
      );
      return { status: response.status, body: (await response.json()) as Ctx };
    };
    const monthEnd = (month: string) => {
      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5, 7));
      return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    };
    const addMonth = (month: string) => {
      const year = Number(month.slice(0, 4));
      const index = Number(month.slice(5, 7));
      const rolled = index === 12;
      return `${rolled ? year + 1 : year}-${String(rolled ? 1 : index + 1).padStart(2, "0")}`;
    };
    const loadWindowPreview = async ({
      startDate,
      endDate,
      timezone,
    }: {
      startDate: string;
      endDate: string;
      timezone: string;
    }) => {
      const response = await fetch("/api/planner/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          timezone,
          source: "manual",
          solveIntent: "stable",
          draftCommands: [],
        }),
      });
      return {
        status: response.status,
        body: (await response.json()) as PreviewBody,
      };
    };

    const localMonth = new Date().toISOString().slice(0, 7);
    const anchor = await loadContext(localMonth);
    const scopeMonthA = anchor.body.asOfDate.slice(0, 7);
    const scopeMonthB = addMonth(scopeMonthA);
    const startDate = `${scopeMonthA}-01`;
    const endDate = monthEnd(scopeMonthB);
    const timezone = anchor.body.timezone;

    const firstPreview = await loadWindowPreview({
      startDate,
      endDate,
      timezone,
    });
    const secondPreview = await loadWindowPreview({
      startDate,
      endDate,
      timezone,
    });
    const hashStable =
      firstPreview.body.preview?.generationInputHash ===
      secondPreview.body.preview?.generationInputHash;

    type SaveBody = {
      publishedWindow?: { startDate: string; endDate: string };
      upsertedCount?: number;
      replayed?: boolean;
    };
    const publish = async (digest: string, preview: NonNullable<Ctx["preview"]>) => {
      const response = await fetch("/api/planner/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedDigest: digest,
          startDate,
          endDate,
          previewHash: preview.generationInputHash,
          confirmationHash: null,
          eligibilityMode: preview.eligibilityMode,
          preserveExistingAssignments: preview.preserveExistingAssignments,
          draftCommands: [],
        }),
      });
      return { status: response.status, body: (await response.json()) as SaveBody };
    };

    const digestBeforeFirst = (await loadContext(scopeMonthA)).body.revisions
      .scheduleDigest;
    const firstSave = await publish(
      digestBeforeFirst,
      secondPreview.body.preview!
    );
    const digestAfterFirst = (await loadContext(scopeMonthA)).body.revisions
      .scheduleDigest;

    const republishPreview = await loadWindowPreview({
      startDate,
      endDate,
      timezone,
    });
    const secondSave = await publish(
      digestAfterFirst,
      republishPreview.body.preview!
    );
    const digestAfterSecond = (await loadContext(scopeMonthA)).body.revisions
      .scheduleDigest;

    return {
      startDate,
      endDate,
      hashStable,
      publishable:
        secondPreview.body.preview?.solver.publishable === true &&
        republishPreview.body.preview?.solver.publishable === true,
      firstSave,
      secondSave,
      firstSaveMovedDigest: digestAfterFirst !== digestBeforeFirst,
      secondSaveMovedDigest: digestAfterSecond !== digestAfterFirst,
    };
  });

  expect(result.hashStable).toBe(true);
  expect(result.publishable).toBe(true);

  expect(result.firstSave.status).toBe(200);
  expect(result.firstSave.body.publishedWindow).toEqual({
    startDate: result.startDate,
    endDate: result.endDate,
  });
  expect((result.firstSave.body.upsertedCount ?? 0) > 0).toBe(
    result.firstSaveMovedDigest
  );

  expect(result.secondSave.status).toBe(200);
  expect(result.secondSave.body.publishedWindow).toEqual({
    startDate: result.startDate,
    endDate: result.endDate,
  });
  expect(result.secondSave.body.upsertedCount).toBe(0);
  expect(result.secondSaveMovedDigest).toBe(false);
});
