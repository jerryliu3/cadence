import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
const completionMutationMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, message: null }))
);
const coachHookMock = vi.hoisted(() => ({
  latestArgs: null as null | {
    applyDraftPolicy: (policy: ReturnType<typeof buildPlannerPolicy>) => void;
    onGoalsCreated: () => Promise<void>;
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
      onGoalsCreated: () => Promise<void>;
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
  useCompletionMutation: () => completionMutationMock,
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
    completionMutationMock.mockReset();
    completionMutationMock.mockResolvedValue({ ok: true, message: null });
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
        visibleStart: "2026-07-27",
        visibleEnd: "2026-11-08",
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

  it("renders a month-scoped vertical window with previous and next month rows", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-20",
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

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    expect(
      document.querySelector('[data-day-cell="true"][data-day="2026-07-01"]')
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      document.querySelector('[data-day-cell="true"][data-day="2026-09-30"]')
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      document.querySelector('[data-month-context-label="Jul"]')
    ).toBeInstanceOf(HTMLElement);
    expect(
      document.querySelector('[data-month-context-label="Sep"]')
    ).toBeInstanceOf(HTMLElement);
  });

  it.each(["month", "week", "three_day"] as const)(
    "keeps time prefix while using compact milestone labels in %s cells",
    async (viewMode) => {
      postJsonMock.mockResolvedValue(
        buildContext([
          unit({
            originalGoalId: "goal-b",
            unitKey: "milestone:2",
            label: "Tempo run 4x800",
            goalDefaultLocalTime: "07:30",
            scheduledDate: "2026-09-01",
          }),
        ])
      );

      render(
        <CalendarSurface
          activeTab="calendar"
          month="2026-09"
          selectedDay={
            viewMode === "month" ? null : "2026-09-01"
          }
          viewMode={viewMode}
          onMonthChange={vi.fn()}
          onViewModeChange={vi.fn()}
          onSelectedDayChange={vi.fn()}
          onPlannerMutation={vi.fn()}
        />
      );

      expect(await screen.findByText("07:30 Tempo run 4x800")).toBeInTheDocument();
      expect(screen.queryByText("07:30 Goal B")).not.toBeInTheDocument();
    }
  );

  it("uses today's weekday column when switching from month to day view", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-20",
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

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Calendar view mode" }));
    fireEvent.click(await screen.findByRole("option", { name: "Day" }));

    expect(onSelectedDayChange).toHaveBeenCalledWith("2026-08-15", "push", "day");
  });

  it("filters visible calendar entries by the search query", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          label: "Goal A",
          scheduledDate: "2026-08-31",
        }),
        unit({
          originalGoalId: "goal-b",
          unitKey: "milestone:2",
          label: "Tempo run 4x800",
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

    expect(await screen.findByText("Goal A")).toBeInTheDocument();
    expect(screen.getByText("Tempo run 4x800")).toBeInTheDocument();

    const searchInput = await screen.findByRole("searchbox", {
      name: /search goals/i,
    });
    expect(screen.getAllByRole("searchbox", { name: /search goals/i })).toHaveLength(1);
    expect(
      within(screen.getByTestId("planner-calendar-toolbar")).getByRole("searchbox", {
        name: /search goals/i,
      })
    ).toBe(searchInput);

    fireEvent.change(searchInput, { target: { value: "goal a" } });
    await waitFor(() => {
      expect(screen.getByText("Goal A")).toBeInTheDocument();
      expect(screen.queryByText("Tempo run 4x800")).not.toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: "4x800" } });
    await waitFor(() => {
      expect(screen.getByText("Tempo run 4x800")).toBeInTheDocument();
      expect(screen.queryByText("Goal A")).not.toBeInTheDocument();
    });
  });

  it("uses milestone label text for day feed entries when available", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-b",
          unitKey: "milestone:2",
          label: "Tempo run 4x800",
          goalDefaultLocalTime: "07:30",
          scheduledDate: "2026-08-31",
        }),
      ])
    );

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

    const dayHeading = await screen.findByText(/Aug 31, 2026/i, { selector: "p" });
    const dayPanel = dayHeading.closest("div");
    if (!dayPanel) {
      throw new Error("Expected day panel container.");
    }

    await waitFor(() => {
      expect(dayPanel.textContent ?? "").toContain("Tempo run 4x800");
      expect(dayPanel.textContent ?? "").not.toContain("07:30 Goal B");
    });
  });

  it("suppresses default milestone label duplication in month preview and event dialog", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-b",
          unitKey: "milestone:2",
          label: "Milestone 2",
          goalDefaultLocalTime: "07:30",
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

    fireEvent.click(dayCell);
    await screen.findByRole("button", { name: "Expand day details" });
    const previewPopover = document.querySelector('[data-no-swipe="true"].fixed');
    if (!(previewPopover instanceof HTMLElement)) {
      throw new Error("Expected preview popover element.");
    }

    expect(within(previewPopover).getByText("07:30 Goal B")).toBeInTheDocument();
    expect(
      within(previewPopover).queryByText("07:30 Milestone 2")
    ).not.toBeInTheDocument();
    expect(within(previewPopover).queryByText("Next: Milestone 2")).not.toBeInTheDocument();

    fireEvent.click(within(previewPopover).getByText("07:30 Goal B"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "07:30 Goal B" })
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Next: Milestone 2")).not.toBeInTheDocument();
  });

  it("force-prepares planner context after coach goals are created", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-31",
        }),
      ])
    );
    const onPlannerMutation = vi.fn();

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-08"
        selectedDay={null}
        viewMode="month"
        onMonthChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSelectedDayChange={vi.fn()}
        onPlannerMutation={onPlannerMutation}
      />
    );
    await waitFor(() => expect(postJsonMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await coachHookMock.latestArgs?.onGoalsCreated();
    });

    expect(onPlannerMutation).toHaveBeenCalledTimes(1);
    expect(postJsonMock).toHaveBeenCalledTimes(2);
    expect(postJsonMock).toHaveBeenLastCalledWith(
      "/api/planner/prepare",
      expect.objectContaining({ scopeMonth: "2026-08" })
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
  });

  it("keeps the centered period and right-aligned calendar actions on one row", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
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

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    const expandButton = screen.getByRole("button", { name: "Expand rows" });
    const heading = screen.getByRole("heading", { name: "August 2026" });
    const actionGroup = expandButton.parentElement;

    expect(actionGroup).not.toBeNull();
    expect(actionGroup).toHaveClass("right-0");
    expect(heading).toBeInTheDocument();
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

    const expandAction = await screen.findByRole(
      "button",
      { name: "Expand day details" },
      { timeout: 2500 }
    );
    expect(expandAction).toBeInTheDocument();

    const popup = document.querySelector('[data-no-swipe="true"].fixed');
    expect(popup).not.toBeNull();
    fireEvent.mouseEnter(popup as Element);
    fireEvent.mouseLeave(dayCell);

    // Simulates the "mouseleave did not fire on popup" stuck path.
    fireEvent.pointerMove(document.body);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Expand day details" })
      ).not.toBeInTheDocument();
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

    const expandAction = await screen.findByRole(
      "button",
      { name: "Expand day details" },
      { timeout: 2500 }
    );
    expect(expandAction).toBeInTheDocument();

    const popup = document.querySelector('[data-no-swipe="true"].fixed');
    expect(popup).not.toBeNull();
    fireEvent.mouseEnter(popup as Element);
    fireEvent.mouseLeave(popup as Element);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Expand day details" })
      ).not.toBeInTheDocument();
    }, { timeout: 300 });
  });

  it("opens every item for the previewed day in a focused dialog", async () => {
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
          label: "Secondary",
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

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    const dayCell = await waitFor(() => {
      const match = document.querySelector(
        '[data-day-cell="true"][data-day="2026-08-31"]'
      );
      if (!(match instanceof HTMLButtonElement)) {
        throw new Error("Expected calendar day cell for 2026-08-31.");
      }
      return match;
    });
    fireEvent.mouseEnter(dayCell);
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Expand day details" },
        { timeout: 2500 }
      )
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Mon, Aug 31" })
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Goal A")).toBeInTheDocument();
    expect(within(dialog).getByText("Goal B")).toBeInTheDocument();
    expect(onSelectedDayChange).not.toHaveBeenCalled();
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
        policyFingerprint: "p".repeat(64),
        policyRevision: 1,
        lockSignature: "lock-a",
        effectiveSpanEnd: "2027-07-31",
        unplacedCount: 3,
        reason: "capacity",
      },
      {
        goalId: "goal-b",
        requirementFingerprint: "b".repeat(64),
        policyFingerprint: "q".repeat(64),
        policyRevision: 1,
        lockSignature: "lock-b",
        effectiveSpanEnd: "2027-07-31",
        unplacedCount: 1,
        reason: "capacity",
      },
    ];
    postJsonMock.mockResolvedValue(context);

    const expectedSummaries = summarizePlannerGoalUnplaceableRecords({
      records: context.unplaceableGoals ?? [],
      goalTitles: context.goalTitles,
    });
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
          "Some goals need updates before the calendar can be fully scheduled."
        )
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "See warnings" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "See warnings" }));
    const dialog = await screen.findByRole("dialog");
    for (const expected of expectedSummaries) {
      expect(within(dialog).getByText(expected.title)).toBeInTheDocument();
    }
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
      screen.queryByRole("button", { name: "See warnings" })
    ).not.toBeInTheDocument();
  });

  it("hides linked-target ineligibility from the warning detail list", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ]);
    if (!context.preview) {
      throw new Error("Expected preview payload.");
    }
    context.links = [
      {
        sourceGoalId: "goal-a",
        targetGoalId: "goal-b",
        targetSuppressionKind: "indefinite",
        targetResumesOn: null,
      },
    ];
    context.preview = {
      ...context.preview,
      eligibility: [
        { goalId: "goal-a", eligible: false, reason: "invalid_date_range" },
        { goalId: "goal-b", eligible: false, reason: "linked_target" },
      ],
    };
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
      expect(screen.getByRole("button", { name: "See warnings" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "See warnings" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        /Goal A: The goal dates are invalid \(start is after end\)\./i
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(
        /Goal B: Linked main goals may be hidden in months where linked subgoals are still active\./i
      )
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/Linked main goals hidden this month/i)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /Goal B: hidden while linked subgoals are still active/i
      )
    ).toBeInTheDocument();
  });

  it("shows linked-target warning details even without hard eligibility blockers", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ]);
    context.links = [
      {
        sourceGoalId: "goal-a",
        targetGoalId: "goal-b",
        targetSuppressionKind: "until",
        targetResumesOn: "2026-09-01",
      },
    ];
    if (!context.preview) {
      throw new Error("Expected preview payload.");
    }
    context.preview = {
      ...context.preview,
      eligibility: [{ goalId: "goal-b", eligible: false, reason: "linked_target" }],
    };
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
      expect(screen.getByRole("button", { name: "See warnings" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "See warnings" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        /Goal B: hidden this month, returns Sep 1, 2026 Linked subgoals: Goal A\./i
      )
    ).toBeInTheDocument();
  });

  it("hides non-actionable eligibility reasons from the warning detail list", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ]);
    if (!context.preview) {
      throw new Error("Expected preview payload.");
    }
    context.preview = {
      ...context.preview,
      eligibility: [
        { goalId: "goal-a", eligible: false, reason: "invalid_date_range" },
        { goalId: "goal-b", eligible: false, reason: "not_owner" },
      ],
    };
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
      expect(screen.getByRole("button", { name: "See warnings" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "See warnings" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        /Goal A: The goal dates are invalid \(start is after end\)\./i
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/Goal B: Only goals you own can be planned here\./i)
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText(/additional goal is excluded automatically/i)
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

    fireEvent.click(await screen.findByText("Next: Baseline"));
    fireEvent.change(await screen.findByLabelText("Date"), {
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

  it("updates rest day checkboxes when coach applies a draft policy", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const tuesdayCheckbox = await screen.findByLabelText("Tue");
    expect(tuesdayCheckbox).not.toBeChecked();

    await act(async () => {
      coachHookMock.latestArgs?.applyDraftPolicy(
        buildPlannerPolicy({ restWeekdays: [2] })
      );
    });

    expect(await screen.findByLabelText("Tue")).toBeChecked();
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

    fireEvent.click(await screen.findByText("Next: Baseline"));
    expect(await screen.findByRole("link", { name: "Edit goal" })).toHaveAttribute(
      "href",
      "/goals/goal-a"
    );
    expect(screen.queryByText("Mark done")).not.toBeInTheDocument();
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

  it("navigates between open goal instances from the event dialog", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          label: "First",
          scheduledDate: "2026-08-29",
        }),
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:2",
          label: "Middle",
          scheduledDate: "2026-08-31",
        }),
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:3",
          label: "Last",
          scheduledDate: "2026-09-02",
        }),
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:4",
          label: "Done",
          scheduledDate: "2026-09-04",
          creditState: "completed",
        }),
        unit({
          originalGoalId: "goal-b",
          unitKey: "total:1",
          label: "Other goal",
          scheduledDate: "2026-08-31",
        }),
      ])
    );
    const onMonthChange = vi.fn();
    const onSelectedDayChange = vi.fn();

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-08"
        selectedDay="2026-08-31"
        viewMode="day"
        onMonthChange={onMonthChange}
        onViewModeChange={vi.fn()}
        onSelectedDayChange={onSelectedDayChange}
        onPlannerMutation={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    fireEvent.click(await screen.findByText("Next: Middle"));
    expect(await screen.findByLabelText("Date")).toHaveValue("2026-08-31");
    expect(onSelectedDayChange).not.toHaveBeenCalled();
    expect(onMonthChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Go to next open instance" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Date")).toHaveValue("2026-09-02");
    });
    expect(onSelectedDayChange).toHaveBeenLastCalledWith(
      "2026-09-02",
      "replace",
      "day"
    );

    expect(
      screen.getByRole("button", { name: "Go to next open instance" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Go to last open instance" })
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Go to first open instance" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Date")).toHaveValue("2026-08-29");
    });
    expect(onSelectedDayChange).toHaveBeenLastCalledWith(
      "2026-08-29",
      "replace",
      "day"
    );
    expect(
      screen.getByRole("button", { name: "Go to first open instance" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Go to previous open instance" })
    ).toBeDisabled();
  });

  it("shows no move-dialog candidates when no eligible source sessions exist", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-31",
          label: "Goal A target",
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

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    const dayCell = document.querySelector(
      '[data-day-cell="true"][data-day="2026-08-31"]'
    );
    expect(dayCell).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(dayCell as Element);
    fireEvent.click(await screen.findByRole("button", { name: "Move" }));

    const dialog = await screen.findByRole("dialog", {
      name: /Move session here/i,
    });
    expect(
      within(dialog).getByText("No movable sessions are eligible for this day.")
    ).toBeInTheDocument();
  });

  it("routes day-panel completion toggles through completion mutation callbacks", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-15",
          classification: "planned",
          creditState: "uncredited",
        }),
      ])
    );

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-08"
        selectedDay="2026-08-15"
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

    fireEvent.click(
      await screen.findByRole("button", { name: "Mark session done" })
    );

    await waitFor(() => {
      expect(completionMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          goalId: "goal-a",
          date: "2026-08-15",
          desiredFactState: "present",
        })
      );
    });
  });

  it("keeps partner scope read-only for planner day actions", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-31",
        }),
      ])
    );

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
        duoScope="partner"
      />
    );

    await waitFor(() => {
      expect(postJsonMock).toHaveBeenCalledWith(
        "/api/planner/prepare",
        expect.any(Object)
      );
    });

    expect(
      screen.queryByRole("button", { name: "Mark session done" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lock" })).not.toBeInTheDocument();
  });

  it("keeps cross-month day scope read-only for planner day actions", async () => {
    postJsonMock.mockResolvedValue(
      buildContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-09-01",
          label: "Outside scope month",
        }),
      ])
    );

    render(
      <CalendarSurface
        activeTab="calendar"
        month="2026-08"
        selectedDay="2026-09-01"
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

    const completionButton = await screen.findByRole("button", {
      name: "Mark session done",
    });
    expect(completionButton).toBeDisabled();
    const lockButton = screen.queryByRole("button", { name: "Lock" });
    if (lockButton) {
      expect(lockButton).toBeDisabled();
    }
  });

  it("aligns the current week using scroll-container coordinates", async () => {
    postJsonMock.mockResolvedValue(buildContext([]));
    const rect = (top: number, height = 96, width = 100): DOMRect => ({
      top,
      bottom: top + height,
      left: 0,
      right: width,
      width,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("overflow-y-auto")) {
          return rect(500, 544, 800);
        }
        if (this.dataset.day === "2026-08-10") {
          const container = this.closest<HTMLElement>(".overflow-y-auto");
          return rect(1200 - (container?.scrollTop ?? 0));
        }
        return rect(0);
      });
    const offsetTopSpy = vi
      .spyOn(HTMLElement.prototype, "offsetTop", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.dataset.day === "2026-08-10" ? 1000 : 0;
      });
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      writable: true,
      value(this: HTMLElement, options: ScrollToOptions) {
        this.scrollTop = options.top ?? 0;
      },
    });
    const animationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    try {
      const { container } = render(
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

      const scrollContainer = await waitFor(() => {
        const element = container.querySelector<HTMLElement>(".overflow-y-auto");
        expect(element).not.toBeNull();
        return element as HTMLElement;
      });

      await waitFor(() => {
        expect(scrollContainer.scrollTop).toBe(700);
      });
    } finally {
      animationFrameSpy.mockRestore();
      if (originalScrollTo) {
        HTMLElement.prototype.scrollTo = originalScrollTo;
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
      }
      offsetTopSpy.mockRestore();
      rectSpy.mockRestore();
    }
  });
});
