import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { summarizePlannerGoalUnplaceableRecords } from "@/lib/planner/unplaceable";

const getJsonMock = vi.fn();
const postJsonMock = vi.fn();
const putJsonMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const coachHookMock = vi.hoisted(() => ({
  latestArgs: null as null | {
    applyDraftPolicy: (policy: ReturnType<typeof buildPlannerPolicy>) => void;
  },
  actions: {
    resetForPlannerStateReset: vi.fn(),
    onDraftDiscarded: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
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
  usePlannerCoach: (args: unknown) => {
    coachHookMock.latestArgs = args as {
      applyDraftPolicy: (policy: ReturnType<typeof buildPlannerPolicy>) => void;
    };
    return {
      actions: coachHookMock.actions,
    };
  },
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
        "goal-b": "Goal B",
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
          title: goalId === "goal-a" ? "Goal A" : "Goal B",
          category: "Personal",
          color: null,
        })),
        items: workUnits.flatMap((workUnit, index) =>
          workUnit.scheduledDate
            ? [
                {
                  id: `item-${index}`,
                  plan_goal_id: workUnit.originalGoalId,
                  unit_key: workUnit.unitKey,
                  requirement_kind: "deadline_total" as const,
                  scheduled_date: workUnit.scheduledDate,
                  original_scheduled_date: workUnit.scheduledDate,
                  classification: workUnit.classification,
                  credit_state: workUnit.creditState,
                  locked: workUnit.locked ?? false,
                  revision: 0,
                  credited_completion_id: null,
                  credited_completion_date: null,
                },
              ]
            : []
        ),
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

describe("CalendarSurface characterization", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    invalidatePlannerRelatedTabCaches();
    getJsonMock.mockReset();
    getJsonMock.mockImplementation(
      () => postJsonMock.mock.results[0]?.value
    );
    postJsonMock.mockReset();
    putJsonMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    coachHookMock.latestArgs = null;
    coachHookMock.actions.onDraftDiscarded.mockReset();
    coachHookMock.actions.resetForPlannerStateReset.mockReset();
  });

  it("renders adjacent-month persisted rows from the prepared context", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-31",
        }),
        unit({
          originalGoalId: "goal-b",
          unitKey: "total:1",
          label: "Goal B label",
          scheduledDate: "2026-09-01",
        }),
      ])
    );

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-09"
        selectedDay={null}
        viewMode="month"
        onMonthChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSelectedDayChange={vi.fn()}
        onPlannerMutation={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith("/api/planner/prepare", {
        scopeMonth: "2026-09",
        visibleStart: "2026-08-01",
        visibleEnd: "2026-10-31",
      });
    });

    const dayCell = await screen.findByRole("button", {
      name: /Tuesday, September 1, 2026\./i,
    });
    expect(dayCell).toHaveAccessibleName(expect.stringContaining("1 planned item"));
    expect(dayCell).not.toHaveAccessibleName(
      expect.stringContaining("2 planned items")
    );
  });

  it("renders calendar directly when planner preferences are missing", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ]);
    postJsonMock.mockResolvedValue({
      ...context,
      preferences: null,
    });

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-10"
        selectedDay={null}
        viewMode="month"
        onMonthChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSelectedDayChange={vi.fn()}
        onPlannerMutation={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    expect(screen.queryByText("Plan setup")).not.toBeInTheDocument();
    expect(await screen.findAllByRole("button", { name: "Go to today" })).not.toHaveLength(0);
  });

  it("dismisses unpinned day preview after pointer leaves preview surface", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ]);
    postJsonMock.mockResolvedValue(context);

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

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    const dayCell = await waitFor(() => {
      const match = document.querySelector('[data-day-cell="true"][data-day="2026-08-31"]');
      if (!(match instanceof HTMLButtonElement)) {
        throw new Error("Expected calendar day cell for 2026-08-31.");
      }
      return match;
    });
    fireEvent.mouseEnter(dayCell);

    const expandAction = await screen.findByText("Expand", {}, { timeout: 2500 });
    expect(expandAction).toBeInTheDocument();

    const popup = document.querySelector('[data-no-swipe="true"].fixed');
    expect(popup).not.toBeNull();
    fireEvent.mouseEnter(popup as Element);
    fireEvent.mouseLeave(dayCell);

    // Simulates the "mouseleave did not fire on popup" stuck path.
    fireEvent.pointerMove(document.body);

    await waitFor(() => {
      expect(screen.queryByText("Expand")).not.toBeInTheDocument();
    }, { timeout: 2500 });
  });

  it("closes hover preview quickly when mouse leaves popup", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ]);
    postJsonMock.mockResolvedValue(context);

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

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    const dayCell = await waitFor(() => {
      const match = document.querySelector('[data-day-cell="true"][data-day="2026-08-31"]');
      if (!(match instanceof HTMLButtonElement)) {
        throw new Error("Expected calendar day cell for 2026-08-31.");
      }
      return match;
    });
    fireEvent.mouseEnter(dayCell);

    const expandAction = await screen.findByText("Expand", {}, { timeout: 2500 });
    expect(expandAction).toBeInTheDocument();

    const popup = document.querySelector('[data-no-swipe="true"].fixed');
    expect(popup).not.toBeNull();
    fireEvent.mouseEnter(popup as Element);
    fireEvent.mouseLeave(popup as Element);

    await waitFor(() => {
      expect(screen.queryByText("Expand")).not.toBeInTheDocument();
    }, { timeout: 300 });
  });

  it("renders banner counts from the shared unplaceable selector", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ]);
    context.unplaceableGoals = [
      {
        goalId: "goal-a",
        requirementFingerprint: "a".repeat(64),
        policyRevision: 1,
        lockSignature: "lock-a",
        effectiveSpanEnd: "2027-07-31",
        unplacedCount: 3,
        reason: "capacity",
      },
      {
        goalId: "goal-b",
        requirementFingerprint: "b".repeat(64),
        policyRevision: 1,
        lockSignature: "lock-b",
        effectiveSpanEnd: "2027-07-31",
        unplacedCount: 1,
        reason: "capacity",
      },
    ];
    postJsonMock.mockResolvedValue(context);

    const expectedSummaries = summarizePlannerGoalUnplaceableRecords({
      records: context.unplaceableGoals,
      goalTitles: context.goalTitles,
    });
    const expectedGoalCount = expectedSummaries.length;
    const expectedUnitCount = expectedSummaries.reduce(
      (count, summary) => count + summary.unplacedCount,
      0
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

    await waitFor(() => {
      expect(
        screen.getByText(
          new RegExp(
            `${expectedGoalCount} goal${expectedGoalCount === 1 ? "" : "s"} are not fully scheduled \\(${expectedUnitCount} unresolved session${expectedUnitCount === 1 ? "" : "s"}\\)\\.`,
            "i"
          )
        )
      ).toBeInTheDocument();
    });
  });

  it("does not render unplaceable banner when no record is present", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ]);
    context.unplaceableGoals = [];
    postJsonMock.mockResolvedValue(context);

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

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalled();
    });
    expect(
      screen.queryByText(/goal[s]? are not fully scheduled/i)
    ).not.toBeInTheDocument();
  });

  it("uses preview-backed save payload for mixed policy and move drafts", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
        placementWindow: { start: "2026-08-01", end: "2026-09-30" },
        draftMoveWindow: { start: "2026-08-01", end: "2026-09-30" },
        creditWindow: { start: "2026-08-01", end: "2026-09-30" },
      }),
    ]);
    const previewForSave = buildPlannerPreview(context.preview?.workUnits ?? [], {
      generationInputHash: "d".repeat(64),
      preserveExistingAssignments: true,
    });
    postJsonMock.mockImplementation(async (url: string) => {
      if (url === "/api/planner/prepare") {
        return context;
      }
      if (url === "/api/planner/context") {
        return { preview: previewForSave };
      }
      if (url === "/api/planner/save") {
        return { replayed: false };
      }
      throw new Error(`Unexpected route ${url}`);
    });

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-08"
        selectedDay="2026-08-31"
        viewMode="day"
        onMonthChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSelectedDayChange={vi.fn()}
        onPlannerMutation={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });
    await act(async () => {
      coachHookMock.latestArgs?.applyDraftPolicy(
        buildPlannerPolicy({ restWeekdays: [2] })
      );
    });

    fireEvent.click(await screen.findByText("Baseline"));
    fireEvent.change(await screen.findByLabelText("Move to"), {
      target: { value: "2026-08-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/save",
        expect.any(Object)
      );
    });
    const saveCall = postJsonMock.mock.calls.find(
      ([url]) => url === "/api/planner/save"
    );
    expect(saveCall?.[1]).toMatchObject({
      previewHash: "d".repeat(64),
      preserveExistingAssignments: true,
      policy: expect.objectContaining({ restWeekdays: [2] }),
    });
    expect(
      postJsonMock.mock.calls.some(([url]) => url === "/api/planner/context")
    ).toBe(true);
  });

  it("forces prepare refresh after toggling a lock", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
        locked: false,
      }),
    ]);
    postJsonMock.mockImplementation(async (url: string) => {
      if (url === "/api/planner/prepare") {
        return context;
      }
      if (url === "/api/planner/items/lock") {
        return {};
      }
      throw new Error(`Unexpected route ${url}`);
    });

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-08"
        selectedDay="2026-08-31"
        viewMode="day"
        onMonthChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSelectedDayChange={vi.fn()}
        onPlannerMutation={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    fireEvent.click(await screen.findByText("Baseline"));
    fireEvent.click(await screen.findByRole("button", { name: "Lock" }));

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/items/lock",
        expect.any(Object)
      );
      expect(
        postJsonMock.mock.calls.filter(([url]) => url === "/api/planner/prepare")
          .length
      ).toBe(2);
    });
  });
});
