import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarSurface } from "./calendar-surface";
import type {
  PlannerContextPayload,
  PlannerVisibleMonthContextPayload,
  PlannerWorkUnit,
} from "./calendar-surface.types";
import type { PlannerPolicy } from "@/lib/planner/policy";

const getJsonMock = vi.fn();
const postJsonMock = vi.fn();
const putJsonMock = vi.fn();
const usePlannerVisibleMonthContextsMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

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
  usePlannerCoach: () => ({}),
}));

vi.mock("@/features/planner/coach/planner-coach-panel", () => ({
  PlannerCoachPanel: () => null,
}));

vi.mock("@/features/planner/use-completion-mutation", () => ({
  useCompletionMutation: () => vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/features/planner/use-planner-visible-month-contexts", () => ({
  usePlannerVisibleMonthContexts: (...args: unknown[]) =>
    usePlannerVisibleMonthContextsMock(...args),
}));

function buildPolicy(): PlannerPolicy {
  return {
    schemaVersion: "1",
    timezone: "UTC",
    timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
    weekStartsOn: 1,
    restWeekdays: [],
    blackoutRanges: [],
  };
}

function unit(overrides: Partial<PlannerWorkUnit>): PlannerWorkUnit {
  return {
    originalGoalId: "goal-a",
    unitKey: "total:1",
    label: "Baseline",
    scheduledDate: "2026-08-31",
    classification: "planned",
    creditState: "uncredited",
    ...overrides,
  };
}

function buildContext(workUnits: PlannerWorkUnit[]): PlannerContextPayload {
  return {
    schemaVersion: "1",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-15",
    timezone: "UTC",
    goalTitles: {
      "goal-a": "Goal A",
      "goal-b": "Goal B",
    },
    preferences: {
      timezone: "UTC",
      timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
      policyRevision: 1,
      defaultPolicy: buildPolicy(),
    },
    capabilities: {
      calendarEnabled: true,
      crossMonthMovesEnabled: false,
    },
    activePlan: null,
    preview: {
      eligibilityMode: "overlap_v1",
      preserveExistingAssignments: true,
      generationInputHash: "hash",
      solver: {
        placementStatus: "complete",
        searchStatus: "all_units_placed",
        capacityStatus: "unverified",
        issueCodes: [],
        invalidGoalIds: [],
        publishable: true,
        confirmationRequired: false,
      },
      workUnits,
    },
    revisions: {
      canonicalRevision: 1,
      executionRevision: 1,
      scheduleDigest: "digest",
    },
    staleness: {
      stale: false,
      reasons: [],
    },
  };
}

function buildVisibleMonthContext(
  workUnits: PlannerWorkUnit[]
): PlannerVisibleMonthContextPayload {
  return {
    scopeMonth: "2026-09",
    goalTitles: {
      "goal-a": "Goal A",
      "goal-b": "Goal B",
    },
    activePlan: null,
    preview: {
      eligibilityMode: "overlap_v1",
      preserveExistingAssignments: true,
      generationInputHash: "visible-hash",
      solver: {
        placementStatus: "complete",
        searchStatus: "all_units_placed",
        capacityStatus: "unverified",
        issueCodes: [],
        invalidGoalIds: [],
        publishable: true,
        confirmationRequired: false,
      },
      workUnits,
    },
  };
}

describe("CalendarSurface characterization", () => {
  beforeEach(() => {
    getJsonMock.mockReset();
    postJsonMock.mockReset();
    putJsonMock.mockReset();
    usePlannerVisibleMonthContextsMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("keeps canonical day ownership when merging visible-month supplemental days", async () => {
    const context = buildContext([
      unit({
        originalGoalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ]);
    getJsonMock.mockResolvedValue(context);
    usePlannerVisibleMonthContextsMock.mockReturnValue({
      "2026-09": buildVisibleMonthContext([
        unit({
          originalGoalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-09-01",
        }),
        unit({
          originalGoalId: "goal-b",
          unitKey: "total:1",
          label: "Goal B label",
          scheduledDate: "2026-09-01",
        }),
      ]),
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
      expect(getJsonMock).toHaveBeenCalledWith("/api/planner/context", {
        query: { scopeMonth: "2026-08" },
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
});
