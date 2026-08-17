import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarSurface } from "./calendar-surface";
import type {
  PlannerContextPayload,
  PlannerWorkUnit,
} from "./calendar-surface.types";
import {
  buildPlannerContext,
  buildPlannerPolicy,
  buildPlannerPreview,
  buildPlannerWorkUnit,
} from "@/features/planner/test-fixtures";
import { invalidatePlannerRelatedTabCaches } from "@/lib/cache/planner-tab-cache";

const getJsonMock = vi.fn();
const postJsonMock = vi.fn();
const putJsonMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/api/client", () => ({
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
  isApiClientError: () => false,
  getJson: (...args: unknown[]) => getJsonMock(...args),
  postJson: (...args: unknown[]) => postJsonMock(...args),
  putJson: (...args: unknown[]) => putJsonMock(...args),
}));

vi.mock("@/features/planner/coach/use-planner-coach", () => ({
  usePlannerCoach: () => ({
    actions: {
      resetForPlannerStateReset: vi.fn(),
      onDraftDiscarded: vi.fn(),
    },
  }),
}));

vi.mock("@/features/planner/coach/planner-coach-panel", () => ({
  PlannerCoachPanel: () => null,
}));

vi.mock("@/features/planner/use-completion-mutation", () => ({
  useCompletionMutation: () => vi.fn(async () => ({ ok: true })),
}));

function unit(overrides: Partial<PlannerWorkUnit>): PlannerWorkUnit {
  return buildPlannerWorkUnit({
    originalGoalId: "goal-a",
    unitKey: "total:1",
    label: "Baseline",
    scheduledDate: "2026-08-31",
    classification: "planned",
    creditState: "uncredited",
    ...overrides,
  });
}

function buildContext(workUnits: PlannerWorkUnit[]): PlannerContextPayload {
  const goalIds = Array.from(
    new Set(workUnits.map((workUnit) => workUnit.originalGoalId))
  );
  return buildPlannerContext({
    workUnits,
    overrides: {
      asOfDate: "2026-08-15",
      goalTitles: {
        "goal-a": "Goal A",
      },
      preferences: {
        timezone: "UTC",
        timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
        policyRevision: 1,
        defaultPolicy: buildPlannerPolicy({ weekStartsOn: 1 }),
      },
      activePlan: {
        plan: {
          id: "persisted-plan",
          version: 1,
          status: "active",
        },
        goals: goalIds.map((goalId) => ({
          id: goalId,
          goal_id: goalId,
          original_goal_id: goalId,
          requirement_fingerprint: "a".repeat(64),
          title: "Goal A",
          category: "Personal",
          color: null,
        })),
        items: workUnits
          .filter((workUnit) => workUnit.scheduledDate)
          .map((workUnit, index) => ({
            id: `item-${index}`,
            plan_goal_id: workUnit.originalGoalId,
            unit_key: workUnit.unitKey,
            requirement_kind: "deadline_total" as const,
            scheduled_date: workUnit.scheduledDate!,
            original_scheduled_date: workUnit.scheduledDate!,
            classification: workUnit.classification,
            credit_state: workUnit.creditState,
            locked: false,
            revision: 0,
            credited_completion_id: null,
            credited_completion_date: null,
          })),
      },
      preview: buildPlannerPreview(workUnits, {
        preserveExistingAssignments: true,
      }),
      revisions: {
        canonicalRevision: 1,
        executionRevision: 1,
        scheduleDigest: "digest",
      },
    },
  });
}

async function flushCalendarInit() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await Promise.resolve();
}

describe("CalendarSurface preview interactions (fake timers)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    invalidatePlannerRelatedTabCaches();
    getJsonMock.mockReset();
    getJsonMock.mockImplementation(
      () => postJsonMock.mock.results[0]?.value
    );
    postJsonMock.mockReset();
    putJsonMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T09:00:00.000Z"));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("opens day mode on touch double-tap", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          scheduledDate: "2026-08-31",
        }),
      ])
    );
    const onSelectedDayChange = vi.fn();

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-08"
        selectedDay={null}
        viewMode="month"
        onMonthChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSelectedDayChange={onSelectedDayChange}
        onPlannerMutation={vi.fn()}
      />
    );

    await flushCalendarInit();
    expect(postJsonMock).toHaveBeenCalled();

    const dayCell = document.querySelector(
      '[data-day-cell="true"][data-day="2026-08-31"]'
    );
    expect(dayCell).toBeInstanceOf(HTMLButtonElement);

    fireEvent.pointerDown(dayCell as Element, { pointerType: "touch" });
    fireEvent.pointerUp(dayCell as Element, { pointerType: "touch" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    fireEvent.pointerDown(dayCell as Element, { pointerType: "touch" });

    expect(onSelectedDayChange).toHaveBeenCalledWith("2026-08-31", "push", "day");
  });

  it("opens a pinned preview on long press", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          scheduledDate: "2026-08-31",
        }),
      ])
    );

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-08"
        selectedDay={null}
        viewMode="month"
        onMonthChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSelectedDayChange={vi.fn()}
        onPlannerMutation={vi.fn()}
      />
    );

    await flushCalendarInit();
    const dayCell = document.querySelector(
      '[data-day-cell="true"][data-day="2026-08-31"]'
    );
    expect(dayCell).toBeInstanceOf(HTMLButtonElement);

    fireEvent.pointerDown(dayCell as Element, { pointerType: "touch" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(
      screen.getByRole("button", { name: "Expand day details" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "X" })).toBeInTheDocument();
  });

  it("dismisses pinned preview on outside pointer down", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          scheduledDate: "2026-08-31",
        }),
      ])
    );

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-08"
        selectedDay={null}
        viewMode="month"
        onMonthChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSelectedDayChange={vi.fn()}
        onPlannerMutation={vi.fn()}
      />
    );

    await flushCalendarInit();

    const dayCell = document.querySelector(
      '[data-day-cell="true"][data-day="2026-08-31"]'
    );
    expect(dayCell).toBeInstanceOf(HTMLButtonElement);

    fireEvent.click(dayCell as Element);
    const before = document.querySelector('[data-no-swipe="true"].fixed');
    expect(before).toBeTruthy();

    fireEvent.pointerDown(document.body);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const after = document.querySelector('[data-no-swipe="true"].fixed');
    expect(after).toBeFalsy();
  });
});
