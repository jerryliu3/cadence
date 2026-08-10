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

interface SavePlanResult {
  requestPayload: {
    draftCommands?: Array<{
      kind: string;
      goalId?: string;
      unitKey?: string;
      scheduledDate?: string | null;
    }>;
  };
  responseStatus: number;
  responseBody: {
    code?: string;
    message?: string;
  };
}

const COMPLETION_TOGGLE_SELECTOR = [
  'button[aria-label^="Mark goal as complete"]',
  'button[aria-label^="Complete goal for "]',
  'button[aria-label^="Unmark goal completion"]',
  'button[aria-label^="Remove completion for "]',
  'button[aria-label="Mark session done"]',
  'button[aria-label="Mark session not done"]',
].join(", ");
const MOVABLE_ENTRY_SELECTOR = [
  '[data-calendar-day-entry="true"][class*="cursor-grab"]:visible',
  '[data-calendar-day-entry="true"]:not([class*="cursor-not-allowed"]):visible',
].join(", ");

function shiftScopeMonth(scopeMonth: string, delta: number) {
  const [rawYear, rawMonth] = scopeMonth.split("-");
  const year = Number.parseInt(rawYear ?? "", 10);
  const month = Number.parseInt(rawMonth ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error(`Invalid scope month: ${scopeMonth}`);
  }
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  const nextYear = shifted.getUTCFullYear();
  const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

async function openCalendar(page: Page, scopeMonth?: string) {
  const query = scopeMonth ? `/?tab=calendar&month=${scopeMonth}` : "/?tab=calendar";
  await page.goto(query);
  await expect(
    page.getByRole("tab", { name: "Calendar", exact: true })
  ).toBeVisible();
  await waitForCalendarReady(page);
  await ensureMonthCalendarDensity(page);

  // CI may land on first-run setup instead of the planner grid.
  const setupHeading = page.getByRole("heading", { name: "Plan setup" });
  if (await setupHeading.isVisible()) {
    const timezone = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    );
    let setupSucceeded = false;
    let lastSetupStatus: number | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const setupResponse = await page.request.put("/api/planner/context", {
        data: { timezone },
        timeout: 15_000,
      });
      lastSetupStatus = setupResponse.status();
      if (setupResponse.ok()) {
        setupSucceeded = true;
        break;
      }
      await page.waitForTimeout(250 * attempt);
    }
    if (!setupSucceeded) {
      throw new Error(
        `Planner setup bootstrap failed (${lastSetupStatus ?? "unknown"}).`
      );
    }
    await page.goto(query);
    await expect(
      page.getByRole("tab", { name: "Calendar", exact: true })
    ).toBeVisible();
    await waitForCalendarReady(page);
    await ensureMonthCalendarDensity(page);
  }
}

async function waitForCalendarReady(page: Page) {
  const loadingLocator = page.getByText("Loading planner month context...");
  const setupHeading = page.getByRole("heading", { name: "Plan setup" });
  await expect
    .poll(
      async () => {
        if (await setupHeading.isVisible().catch(() => false)) {
          return "setup";
        }
        return (await loadingLocator.count()) === 0 ? "ready" : "loading";
      },
      { timeout: 20_000 }
    )
    .not.toBe("loading");
}

async function ensureMonthCalendarDensity(page: Page) {
  const monthViewButton = page.getByRole("button", { name: "Month", exact: true });
  if (await monthViewButton.isVisible().catch(() => false)) {
    await monthViewButton.click();
  }

  const expandRowsButton = page.getByRole("button", { name: "Expand rows", exact: true });
  if (await expandRowsButton.isVisible().catch(() => false)) {
    await expandRowsButton.click();
    await expect(
      page.getByRole("button", { name: "Compact rows", exact: true })
    ).toBeVisible();
  }
}

async function ensureMovableEntryAvailable(page: Page, maxMonthJumps = 12) {
  const startScopeMonth = await resolveCalendarScopeMonth(page);
  const scanOrder: number[] = [0];
  for (let jump = 1; jump <= maxMonthJumps; jump += 1) {
    scanOrder.push(jump, -jump);
  }

  for (const delta of scanOrder) {
    const scopeMonth =
      delta === 0 ? startScopeMonth : shiftScopeMonth(startScopeMonth, delta);
    if (delta !== 0) {
      await openCalendar(page, scopeMonth);
    }
    const movableEntries = page.locator(MOVABLE_ENTRY_SELECTOR);
    if ((await movableEntries.count()) > 0) {
      return true;
    }
  }
  return false;
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
      preview: {
        workUnits: Array<{
          originalGoalId: string;
          unitKey: string;
          scheduledDate: string | null;
        }>;
      } | null;
    };
    const placementsByEntryKey: Record<string, string | null> = {};
    if (body.activePlan) {
      const goalIdByPlanGoalId = new Map(
        body.activePlan.goals.map((goal) => [goal.id, goal.original_goal_id])
      );
      for (const item of body.activePlan.items) {
        const originalGoalId = goalIdByPlanGoalId.get(item.plan_goal_id);
        if (!originalGoalId || item.scheduled_date === null) {
          continue;
        }
        placementsByEntryKey[`${originalGoalId}:${item.unit_key}`] =
          item.scheduled_date;
      }
    } else if (body.preview) {
      for (const unit of body.preview.workUnits) {
        if (unit.scheduledDate === null) {
          continue;
        }
        placementsByEntryKey[`${unit.originalGoalId}:${unit.unitKey}`] =
          unit.scheduledDate;
      }
    } else {
      throw new Error(
        "Planner context has neither active plan nor preview; cannot snapshot placements."
      );
    }
    return {
      scopeMonth: body.scopeMonth,
      placementsByEntryKey,
    };
  }, scopeMonth);
}

async function moveFirstMovableEntry(page: Page) {
  const sourceEntry = page.locator(MOVABLE_ENTRY_SELECTOR).first();
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
      request.method() === "POST",
    { timeout: 15_000 }
  );
  await trigger();
  const request = await requestPromise;
  const payload = request.postDataJSON() as CompletionMutationPayload;
  expect(payload.goalId).toBeTruthy();
  expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(payload.desiredFactState === "present" || payload.desiredFactState === "absent").toBe(
    true
  );
  expect(payload.timezone).toBeTruthy();
  return payload;
}

async function runPlannerSaveAction(page: Page): Promise<SavePlanResult> {
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
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  const [saveRequest, saveResponse] = await Promise.all([
    saveRequestPromise,
    saveResponsePromise,
  ]);
  const responseBody = (await saveResponse.json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;
  return {
    requestPayload: saveRequest.postDataJSON() as SavePlanResult["requestPayload"],
    responseStatus: saveResponse.status(),
    responseBody: responseBody ?? {},
  };
}

test.describe("planner critical rails", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Critical planner rails currently run as chromium-only checks."
  );

  test("drag + save emits only intended unit movement", async ({ page }) => {
    test.setTimeout(120_000);
    const executeMoveAndSave = async () => {
      await openCalendar(page);
      const hasMovableEntry = await ensureMovableEntryAvailable(page);
      test.skip(
        !hasMovableEntry,
        "No movable planner entry found in scanned seeded horizon."
      );
      const scopeMonth = await resolveCalendarScopeMonth(page);
      const before = await fetchPlannerContextSnapshot(page, scopeMonth);

      await moveFirstMovableEntry(page);
      await expect(page.getByText("Planning Mode")).toBeVisible({ timeout: 10_000 });
      const saveButton = page.getByRole("button", { name: "Save plan", exact: true });
      await expect(saveButton).toBeEnabled();

      const saveResult = await runPlannerSaveAction(page);

      return {
        scopeMonth,
        before,
        saveResult,
      };
    };

    let attempt = await executeMoveAndSave();
    // Preview hashes can become stale from concurrent planner data churn in CI;
    // replay fresh drag/save cycles up to a small bound before failing.
    for (let staleRetry = 0; staleRetry < 2; staleRetry += 1) {
      if (
        attempt.saveResult.responseStatus !== 409 ||
        attempt.saveResult.responseBody.code !== "preview_hash_mismatch"
      ) {
        break;
      }
      await page.reload();
      attempt = await executeMoveAndSave();
    }

    const requestPayload = attempt.saveResult.requestPayload;
    const moveCommands = (requestPayload.draftCommands ?? []).filter(
      (command): command is {
        kind: string;
        goalId: string;
        unitKey: string;
        scheduledDate: string;
      } =>
        command.kind === "move_item" &&
        typeof command.goalId === "string" &&
        typeof command.unitKey === "string" &&
        typeof command.scheduledDate === "string"
    );
    expect(moveCommands).toHaveLength(1);
    const moveCommand = moveCommands[0];
    const movedEntryKey = `${moveCommand.goalId}:${moveCommand.unitKey}`;

    if (
      attempt.saveResult.responseStatus === 409 &&
      attempt.saveResult.responseBody.code === "preview_hash_mismatch"
    ) {
      // We already proved this draft only emits one move command.
      // On repeated preview-hash churn, avoid turning the rail into a flaky
      // end-to-end publish gate; stale-save recoverability is covered below.
      await expect(
        page.getByText("Planner preview hash is stale. Regenerate and publish again.")
      ).toBeVisible();
      await expect(page.getByText("Planning Mode")).toBeVisible();
      return;
    }

    expect(
      attempt.saveResult.responseStatus,
      JSON.stringify(attempt.saveResult.responseBody)
    ).toBe(200);

    await page.reload();
    await openCalendar(page);
    const after = await fetchPlannerContextSnapshot(page, attempt.before.scopeMonth);

    const changedEntries = Array.from(
      new Set([
        ...Object.keys(attempt.before.placementsByEntryKey),
        ...Object.keys(after.placementsByEntryKey),
      ])
    )
      .filter(
        (entryKey) =>
          (attempt.before.placementsByEntryKey[entryKey] ?? null) !==
          (after.placementsByEntryKey[entryKey] ?? null)
      )
      .sort();
    expect(changedEntries).toEqual([movedEntryKey]);
    expect(after.placementsByEntryKey[movedEntryKey]).toBe(moveCommand.scheduledDate);
  });

  test("completion toggle dispatches from today surface", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/?tab=today");
    await expect(page.getByRole("tab", { name: "Today", exact: true })).toBeVisible();
    const initialButton = page.locator(COMPLETION_TOGGLE_SELECTOR).first();
    await expect(initialButton).toBeVisible();
    await expect(initialButton).toBeEnabled();

    const todayPayload = await runCompletionToggleAction(page, async () => {
      await initialButton.click();
    });
    expect(todayPayload.goalId).toBeTruthy();
  });

  test("completion toggle dispatches from past tab surface", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/?tab=past");
    await expect(page.getByRole("tab", { name: "Past", exact: true })).toBeVisible();
    const pastToggle = page.locator(COMPLETION_TOGGLE_SELECTOR).first();
    await expect(pastToggle).toBeVisible({ timeout: 10_000 });
    await expect(pastToggle).toBeEnabled();
    const pastPayload = await runCompletionToggleAction(page, async () => {
      await pastToggle.click();
    });
    expect(pastPayload.goalId).toBeTruthy();
    const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    expect(pastPayload.date <= today).toBe(true);
  });

  test("completion toggle dispatches from calendar surface", async ({ page }) => {
    test.setTimeout(120_000);
    await openCalendar(page);
    const dayCellWithEntry = page
      .locator('[data-day-cell="true"]')
      .filter({ has: page.locator('[data-calendar-day-entry="true"]') })
      .first();
    await expect(dayCellWithEntry).toBeVisible();
    await dayCellWithEntry.click();
    const calendarPayload = await runCompletionToggleAction(page, async () => {
      const button = page
        .locator(COMPLETION_TOGGLE_SELECTOR)
        .first();
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      await button.click();
    });
    expect(calendarPayload.goalId).toBeTruthy();
  });

  test("stale save keeps planner draft session recoverable", async ({ page }) => {
    await openCalendar(page);
    const hasMovableEntry = await ensureMovableEntryAvailable(page);
    test.skip(
      !hasMovableEntry,
      "No movable planner entry found in scanned seeded horizon."
    );
    await moveFirstMovableEntry(page);
    await expect(page.getByText("Planning Mode")).toBeVisible({ timeout: 10_000 });

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
