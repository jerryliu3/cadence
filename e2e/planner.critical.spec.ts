import { expect, test, type Page } from "@playwright/test";

interface PlannerContextSnapshot {
  scopeMonth: string;
  placementsByEntryKey: Record<string, string | null>;
}

interface CompletionMutationPayload {
  goalId: string;
  date: string;
  desiredFactState: "present" | "absent";
  timezone: string;
}

async function openCalendar(page: Page) {
  await page.goto("/?tab=calendar");
  await expect(
    page.getByRole("tab", { name: "Calendar", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Loading planner month context...")).toHaveCount(0);
}

async function resolveCalendarScopeMonth(page: Page) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const fromUrl = new URL(page.url()).searchParams.get("month");
    if (fromUrl) {
      return fromUrl;
    }
    await page.waitForTimeout(100);
  }
  return page.evaluate(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
}

async function fetchPlannerContextSnapshot(
  page: Page,
  scopeMonth: string
): Promise<PlannerContextSnapshot> {
  return page.evaluate(async (month) => {
    const response = await fetch(`/api/planner/context?scopeMonth=${month}`);
    if (!response.ok) {
      throw new Error(
        `Planner context load failed (${response.status}) for scope ${month}.`
      );
    }
    const body = (await response.json()) as {
      scopeMonth: string;
      activePlan: {
        goals: Array<{ id: string; original_goal_id: string }>;
        items: Array<{
          plan_goal_id: string;
          unit_key: string;
          scheduled_date: string | null;
        }>;
      } | null;
    };
    if (!body.activePlan) {
      throw new Error("Planner context has no active plan; cannot snapshot placements.");
    }
    const goalIdByPlanGoalId = new Map(
      body.activePlan.goals.map((goal) => [goal.id, goal.original_goal_id])
    );
    const placementsByEntryKey: Record<string, string | null> = {};
    for (const item of body.activePlan.items) {
      const originalGoalId = goalIdByPlanGoalId.get(item.plan_goal_id);
      if (!originalGoalId) {
        continue;
      }
      placementsByEntryKey[`${originalGoalId}:${item.unit_key}`] =
        item.scheduled_date ?? null;
    }
    return {
      scopeMonth: body.scopeMonth,
      placementsByEntryKey,
    };
  }, scopeMonth);
}

async function moveFirstMovableEntry(page: Page) {
  const sourceEntry = page
    .locator('[data-calendar-day-entry="true"][title*="Drag to another day"]')
    .first();
  await expect(sourceEntry).toBeVisible();

  const sourceDay = await sourceEntry.evaluate((element) =>
    element.closest('[data-day-cell="true"]')?.getAttribute("data-day")
  );
  if (!sourceDay) {
    throw new Error("Could not resolve source day for draggable planner entry.");
  }

  const targetDay = await page.evaluate((currentDay) => {
    const scopeMonth = currentDay.slice(0, 7);
    const candidates = Array.from(
      document.querySelectorAll('[data-day-cell="true"][data-day]')
    )
      .map((element) => element.getAttribute("data-day"))
      .filter(
        (value): value is string =>
          typeof value === "string" &&
          value.startsWith(scopeMonth) &&
          value !== currentDay
      )
      .sort();
    return candidates[0] ?? null;
  }, sourceDay);
  if (!targetDay) {
    throw new Error("Could not find a valid planner day-cell drop target.");
  }

  const targetCell = page
    .locator(`[data-day-cell="true"][data-day="${targetDay}"]`)
    .first();
  await expect(targetCell).toBeVisible();

  const sourceBox = await sourceEntry.boundingBox();
  const targetBox = await targetCell.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Could not determine drag/drop hit boxes.");
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  );
  await page.mouse.down();
  // Match dnd-kit mouse activation delay in calendar-dnd.tsx.
  await page.waitForTimeout(180);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 28, {
    steps: 20,
  });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

async function runCompletionToggleAction(
  page: Page,
  trigger: () => Promise<void>
): Promise<CompletionMutationPayload> {
  const requestPromise = page.waitForRequest(
    (request) =>
      request.url().includes("/api/completions") &&
      request.method() === "POST"
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/completions") &&
      response.request().method() === "POST"
  );
  await trigger();

  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  const payload = request.postDataJSON() as CompletionMutationPayload;
  expect(response.status()).toBe(200);
  expect(payload.goalId).toBeTruthy();
  expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(payload.desiredFactState === "present" || payload.desiredFactState === "absent").toBe(
    true
  );
  expect(payload.timezone).toBeTruthy();
  return payload;
}

async function expectCompletionPersisted(
  page: Page,
  payload: CompletionMutationPayload
) {
  const outcome = await page.evaluate(async (input) => {
    const query = new URLSearchParams({
      asOfDate: input.date,
      viewDate: input.date,
      timezone: input.timezone,
    });
    const response = await fetch(`/api/progress/context?${query.toString()}`);
    const body = (await response.json()) as {
      facts?: Array<{ goal_id: string; completed_on: string }>;
    };
    const hasFact = (body.facts ?? []).some(
      (fact) =>
        fact.goal_id === input.goalId && fact.completed_on === input.date
    );
    return {
      status: response.status,
      hasFact,
    };
  }, payload);
  expect(outcome.status).toBe(200);
  expect(outcome.hasFact).toBe(payload.desiredFactState === "present");
}

test.describe("planner critical rails", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Critical planner rails currently run as chromium-only checks."
  );

  test("drag + save keeps only intended unit movement", async ({ page }) => {
    await openCalendar(page);
    const scopeMonth = await resolveCalendarScopeMonth(page);
    const before = await fetchPlannerContextSnapshot(page, scopeMonth);

    await moveFirstMovableEntry(page);
    await expect(page.getByText("Planning Mode")).toBeVisible();
    const saveButton = page.getByRole("button", { name: "Save plan", exact: true });
    await expect(saveButton).toBeEnabled();

    const saveRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes("/api/planner/save") &&
        request.method() === "POST"
    );
    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/planner/save") &&
        response.request().method() === "POST"
    );
    await saveButton.click();
    const [saveRequest, saveResponse] = await Promise.all([
      saveRequestPromise,
      saveResponsePromise,
    ]);
    const saveBody = (await saveResponse.json()) as {
      code?: string;
      message?: string;
    };
    expect(saveResponse.status(), JSON.stringify(saveBody)).toBe(200);

    const requestPayload = saveRequest.postDataJSON() as {
      draftCommands?: Array<{
        kind: string;
        goalId?: string;
        unitKey?: string;
        scheduledDate?: string | null;
      }>;
    };
    const moveCommand = (requestPayload.draftCommands ?? []).find(
      (command) =>
        command.kind === "move_item" &&
        typeof command.goalId === "string" &&
        typeof command.unitKey === "string" &&
        typeof command.scheduledDate === "string"
    );
    expect(moveCommand).toBeTruthy();
    const movedEntryKey = `${moveCommand!.goalId}:${moveCommand!.unitKey}`;

    await page.reload();
    await openCalendar(page);
    const after = await fetchPlannerContextSnapshot(page, before.scopeMonth);

    const changedEntries = Object.keys(before.placementsByEntryKey)
      .filter(
        (entryKey) =>
          before.placementsByEntryKey[entryKey] !== after.placementsByEntryKey[entryKey]
      )
      .sort();
    expect(changedEntries).toEqual([movedEntryKey]);
    expect(after.placementsByEntryKey[movedEntryKey]).toBe(moveCommand!.scheduledDate);
  });

  test("completion toggle persists from today, past(insights), and calendar", async ({
    page,
  }) => {
    await page.goto("/?tab=today");
    await expect(page.getByRole("tab", { name: "Today", exact: true })).toBeVisible();
    const todayPayload = await runCompletionToggleAction(page, async () => {
      const button = page
        .getByRole("button", {
          name: /Mark goal as complete|Unmark goal completion for current period|Complete goal for|Remove completion for/,
        })
        .first();
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      await button.click();
    });
    await expectCompletionPersisted(page, todayPayload);

    await page.getByRole("tab", { name: "Past", exact: true }).click();
    await expect(page).toHaveURL(/tab=not-today/);
    const editButton = page
      .getByRole("button", { name: /Edit dates|Edit milestones/ })
      .first();
    await expect(editButton).toBeVisible();
    await editButton.click();
    const selectedInsightsDate = await page.evaluate(() => {
      const today = new Date().toISOString().slice(0, 10);
      const dates = Array.from(
        document.querySelectorAll("button[title]")
      )
        .map((button) => button.getAttribute("title")?.split(":")[0] ?? null)
        .filter((date): date is string => typeof date === "string")
        .filter((date) => date <= today)
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        .sort();
      return dates.at(-1) ?? null;
    });
    expect(selectedInsightsDate).toBeTruthy();
    const insightsPayload = await runCompletionToggleAction(page, async () => {
      const button = page
        .locator(`button[title^="${selectedInsightsDate}:"]`)
        .first();
      await expect(button).toBeVisible();
      await button.click();
    });
    await expectCompletionPersisted(page, insightsPayload);

    await openCalendar(page);
    const dayCellWithEntry = page
      .locator('[data-day-cell="true"]')
      .filter({ has: page.locator('[data-calendar-day-entry="true"]') })
      .first();
    await expect(dayCellWithEntry).toBeVisible();
    await dayCellWithEntry.click();
    const calendarPayload = await runCompletionToggleAction(page, async () => {
      const button = page
        .locator(
          'button[aria-label="Mark session done"], button[aria-label="Mark session not done"]'
        )
        .first();
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      await button.click();
    });
    await expectCompletionPersisted(page, calendarPayload);
  });

  test("stale save keeps planner draft session recoverable", async ({ page }) => {
    await openCalendar(page);
    await moveFirstMovableEntry(page);
    await expect(page.getByText("Planning Mode")).toBeVisible();

    await page.route("**/api/planner/save", async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as {
        expectedDigest?: string;
        [key: string]: unknown;
      };
      const digest = body.expectedDigest;
      if (typeof digest === "string" && digest.length === 64) {
        body.expectedDigest = `${digest[0] === "a" ? "b" : "a"}${digest.slice(1)}`;
      }
      await route.continue({
        postData: JSON.stringify(body),
        headers: {
          ...request.headers(),
          "content-type": "application/json",
        },
      });
    });

    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/planner/save") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Save plan", exact: true }).click();
    const saveResponse = await saveResponsePromise;
    const body = (await saveResponse.json()) as { code?: string };
    expect(saveResponse.status()).toBe(409);
    expect(body.code).toBe("stale_revision");

    await expect(page.getByText("Planning Mode")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Undo changes", exact: true })
    ).toBeVisible();
  });
});
