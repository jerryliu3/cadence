import { describe, expect, it } from "vitest";
import {
  CHECKLIST_COMPLETION_ERROR_MESSAGE,
  MOBILE_CHECKLIST_GOALS_SELECT,
  type MobileGoal,
  buildChecklistProgressQuery,
  countChecklistCompletionsForDate,
  isChecklistLaneInteractive,
  latestCompletionDateByGoal,
  resolveChecklistCompletableGoalIds,
  resolveChecklistMutationDate,
  resolvePartnerChecklistStripState,
  resolveTeamMembershipIds,
  selectChecklistGoalsForSubject,
  shouldReportViewerLaneCompletion,
} from "./checklist-lane-data";

const goals: MobileGoal[] = [
  {
    id: "viewer-owned",
    owner_id: "viewer-1",
    title: "Viewer owned",
    description: null,
    category: "Health",
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: 1,
    start_date: "2026-01-01",
    end_date: null,
    team_id: null,
    photo_path: null,
    archived_at: null,
    is_deleted: false,
  },
  {
    id: "team-goal",
    owner_id: "team-1",
    title: "Team goal",
    description: null,
    category: "Team",
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: 1,
    start_date: "2026-01-01",
    end_date: null,
    team_id: "team-1",
    photo_path: null,
    archived_at: null,
    is_deleted: false,
  },
  {
    id: "partner-owned",
    owner_id: "partner-1",
    title: "Partner owned",
    description: null,
    category: "Partner",
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: 1,
    start_date: "2026-01-01",
    end_date: null,
    team_id: null,
    photo_path: null,
    archived_at: null,
    is_deleted: false,
  },
  {
    id: "partner-team",
    owner_id: "partner-1",
    title: "Partner-created team goal",
    description: null,
    category: "Team",
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: 2,
    start_date: "2026-01-01",
    end_date: null,
    team_id: "team-1",
    photo_path: null,
    archived_at: null,
    is_deleted: false,
  },
];

describe("checklist lane data helpers", () => {
  it("keeps viewer-visible goals and excludes partner-owned goals", () => {
    const selected = selectChecklistGoalsForSubject({
      goals,
      subject: { id: "viewer", label: "Mine", readOnly: false, userId: "viewer-1" },
      partnerId: "partner-1",
      memberTeamIds: ["team-1"],
    });

    expect(selected.map((goal) => goal.id)).toEqual([
      "viewer-owned",
      "team-goal",
      "partner-team",
    ]);
  });

  it("keeps only partner-owned goals in partner lane", () => {
    const selected = selectChecklistGoalsForSubject({
      goals,
      subject: {
        id: "partner",
        label: "Alex",
        readOnly: true,
        userId: "partner-1",
      },
      partnerId: "partner-1",
    });

    expect(selected.map((goal) => goal.id)).toEqual(["partner-owned"]);
  });

  it("omits subjectUserId when requesting viewer progress", () => {
    const query = buildChecklistProgressQuery({
      asOfDate: "2026-08-01",
      timezone: "UTC",
      subject: { id: "viewer", label: "Mine", readOnly: false, userId: "viewer-1" },
    });

    expect(query.get("subjectUserId")).toBeNull();
    expect(query.toString()).toContain("asOfDate=2026-08-01");
  });

  it("sends subjectUserId when requesting partner progress", () => {
    const query = buildChecklistProgressQuery({
      asOfDate: "2026-08-01",
      timezone: "UTC",
      subject: {
        id: "partner",
        label: "Alex",
        readOnly: true,
        userId: "partner-1",
      },
    });

    expect(query.get("subjectUserId")).toBe("partner-1");
  });

  it("counts same-day completions for summary strips and lanes", () => {
    expect(
      countChecklistCompletionsForDate({
        asOfDate: "2026-08-01",
        facts: [
          { goal_id: "a", completed_on: "2026-08-01", source: "manual" },
          { goal_id: "b", completed_on: "2026-08-01", source: "linked_cascade" },
          { goal_id: "c", completed_on: "2026-07-31", source: "manual" },
        ],
      })
    ).toBe(2);
  });

  it("uses server-selected period facts for checked state and uncheck dates", () => {
    const facts = [
      {
        goal_id: "weekly",
        completed_on: "2026-08-11",
        source: "manual" as const,
      },
      {
        goal_id: "monthly",
        completed_on: "2026-08-02",
        source: "manual" as const,
      },
    ];
    const completionDateByGoal = latestCompletionDateByGoal(facts);

    expect(new Set(facts.map((fact) => fact.goal_id))).toEqual(
      new Set(["weekly", "monthly"])
    );
    expect(
      resolveChecklistMutationDate({
        goalId: "weekly",
        desiredFactState: "absent",
        asOfDate: "2026-08-14",
        completionDateByGoal,
      })
    ).toBe("2026-08-11");
    expect(
      resolveChecklistMutationDate({
        goalId: "monthly",
        desiredFactState: "present",
        asOfDate: "2026-08-14",
        completionDateByGoal,
      })
    ).toBe("2026-08-14");
  });

  it("resolves partner strip states without affecting viewer lane data", () => {
    expect(
      resolvePartnerChecklistStripState({
        hasActivePartner: true,
        isLoading: true,
        error: null,
        progress: null,
        asOfDate: "2026-08-01",
      })
    ).toEqual({ status: "loading" });

    expect(
      resolvePartnerChecklistStripState({
        hasActivePartner: true,
        isLoading: false,
        error: new Error("boom"),
        progress: null,
        asOfDate: "2026-08-01",
      })
    ).toEqual({ status: "unavailable" });

    expect(
      resolvePartnerChecklistStripState({
        hasActivePartner: true,
        isLoading: false,
        error: null,
        progress: {
          schemaVersion: "1",
          asOfDate: "2026-08-01",
          timezone: "UTC",
          weekStartsOn: 1,
          summaries: [
            {
              goalId: "a",
              admissibleCompletionCount: 1,
              creditedUnitCount: 1,
              expectedUnitCount: 1,
              percent: 100,
              lifecycle: "active",
              outcome: "in_progress",
              placementTerminal: false,
              currentStreak: 1,
              longestStreak: 1,
              milestoneDates: [],
            },
          ],
          facts: [{ goal_id: "a", completed_on: "2026-08-01", source: "manual" }],
          truncated: false,
          correlationId: "corr-1",
        },
        asOfDate: "2026-08-01",
      })
    ).toEqual({ status: "ready", completionCount: 1, goalCount: 1 });
  });

  it("marks only viewer lanes as interactive", () => {
    expect(
      isChecklistLaneInteractive({ id: "viewer", label: "Mine", readOnly: false })
    ).toBe(true);
    expect(
      isChecklistLaneInteractive({ id: "partner", label: "Alex", readOnly: true })
    ).toBe(false);
  });

  it("builds completable ids for viewer-owned and active-team goals only", () => {
    expect(
      resolveChecklistCompletableGoalIds({
        goals,
        subject: { id: "viewer", label: "Mine", readOnly: false, userId: "viewer-1" },
        viewerUserId: "viewer-1",
        memberTeamIds: ["team-1"],
      })
    ).toEqual(new Set(["viewer-owned", "team-goal", "partner-team"]));
  });

  it("returns no completable ids for partner lane", () => {
    expect(
      resolveChecklistCompletableGoalIds({
        goals,
        subject: {
          id: "partner",
          label: "Alex",
          readOnly: true,
          userId: "partner-1",
        },
        viewerUserId: "viewer-1",
        memberTeamIds: ["team-1"],
      })
    ).toEqual(new Set());
  });

  it("uses a stable actionable completion error message", () => {
    expect(CHECKLIST_COMPLETION_ERROR_MESSAGE).toBe(
      "Could not update completion. Try again."
    );
  });

  it("exports goals projection with team_id for completable gating", () => {
    expect(MOBILE_CHECKLIST_GOALS_SELECT).toContain("id");
    expect(MOBILE_CHECKLIST_GOALS_SELECT).toContain("owner_id");
    expect(MOBILE_CHECKLIST_GOALS_SELECT).toContain("team_id");
  });

  it("degrades membership lookup failure to empty team ids", () => {
    expect(resolveTeamMembershipIds({ rows: null, hasError: true })).toEqual([]);
    expect(
      resolveTeamMembershipIds({
        rows: [{ team_id: "team-1" }, { team_id: "team-2" }],
        hasError: false,
      })
    ).toEqual(["team-1", "team-2"]);
  });

  it("reports completion telemetry only for viewer present toggles", () => {
    expect(
      shouldReportViewerLaneCompletion({
        interactive: true,
        desiredFactState: "present",
      })
    ).toBe(true);
    expect(
      shouldReportViewerLaneCompletion({
        interactive: true,
        desiredFactState: "absent",
      })
    ).toBe(false);
    expect(
      shouldReportViewerLaneCompletion({
        interactive: false,
        desiredFactState: "present",
      })
    ).toBe(false);
  });
});
