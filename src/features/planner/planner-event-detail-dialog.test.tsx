import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PlannerEventDetailDialog } from "@/features/planner/planner-event-detail-dialog"
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types"

function buildEntry(): PlannerDayDetailEntry {
  return {
    key: "goal-a:total:1",
    originalGoalId: "goal-a",
    goalTitle: "Goal A",
    unitKey: "total:1",
    label: "Goal A",
    classification: "scheduled",
    creditState: "uncredited",
    activeGoal: null,
    activeItem: null,
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
  }
}

describe("PlannerEventDetailDialog", () => {
  it("does not auto-focus the title field on open", async () => {
    const callbacks = {
      onOpenChange: vi.fn(),
      onUpdateDraftLabel: vi.fn(),
      onUpdateDraftScheduledDate: vi.fn(),
      onUpdateDraftScheduledTimeOverride: vi.fn(),
      onToggleItemLock: vi.fn(),
      onRequestDeleteInstance: vi.fn(),
      onNavigateToFirstOpenInstance: vi.fn(),
      onNavigateToPreviousOpenInstance: vi.fn(),
      onNavigateToNextOpenInstance: vi.fn(),
      onNavigateToLastOpenInstance: vi.fn(),
    }

    render(
      <PlannerEventDetailDialog
        selectedEventEntry={buildEntry()}
        selectedEventLinkedTargets={[]}
        goalTitles={{}}
        scopeMonth="2026-08"
        selectedEventDraftEdit={undefined}
        selectedEventBaselineUnit={null}
        selectedEventDraftScheduledDate="2026-08-31"
        selectedEventDraftTimeInputValue=""
        mutationLoadingKey={null}
        canMutatePlanItems
        canDeleteSelectedInstance={false}
        deleteBlockedReason="blocked"
        canNavigateToFirstOpenInstance={false}
        canNavigateToPreviousOpenInstance={false}
        canNavigateToNextOpenInstance={false}
        canNavigateToLastOpenInstance={false}
        getEntryGoalFirstTitleWithTime={() => "Goal A"}
        callbacks={callbacks}
      />
    )

    const titleInput = await screen.findByPlaceholderText("Goal title")
    expect(titleInput).not.toHaveFocus()
  })

  it("renders centered title and instance navigation controls", async () => {
    const callbacks = {
      onOpenChange: vi.fn(),
      onUpdateDraftLabel: vi.fn(),
      onUpdateDraftScheduledDate: vi.fn(),
      onUpdateDraftScheduledTimeOverride: vi.fn(),
      onToggleItemLock: vi.fn(),
      onRequestDeleteInstance: vi.fn(),
      onNavigateToFirstOpenInstance: vi.fn(),
      onNavigateToPreviousOpenInstance: vi.fn(),
      onNavigateToNextOpenInstance: vi.fn(),
      onNavigateToLastOpenInstance: vi.fn(),
    }

    render(
      <PlannerEventDetailDialog
        selectedEventEntry={buildEntry()}
        selectedEventLinkedTargets={[]}
        goalTitles={{}}
        scopeMonth="2026-08"
        selectedEventDraftEdit={undefined}
        selectedEventBaselineUnit={null}
        selectedEventDraftScheduledDate="2026-08-31"
        selectedEventDraftTimeInputValue=""
        mutationLoadingKey={null}
        canMutatePlanItems
        canDeleteSelectedInstance={false}
        deleteBlockedReason="blocked"
        canNavigateToFirstOpenInstance
        canNavigateToPreviousOpenInstance={false}
        canNavigateToNextOpenInstance
        canNavigateToLastOpenInstance
        getEntryGoalFirstTitleWithTime={() => "Goal A"}
        callbacks={callbacks}
      />
    )

    const activeDialog = (await screen.findAllByRole("dialog")).at(-1)
    expect(activeDialog).toBeDefined()
    expect(within(activeDialog!).getByRole("heading", { name: "Goal A" })).toHaveClass(
      "text-center"
    )
    expect(within(activeDialog!).getByLabelText("Date")).toHaveValue("2026-08-31")
    expect(
      within(activeDialog!).getByRole("button", { name: "Go to previous open instance" })
    ).toBeDisabled()

    fireEvent.click(
      within(activeDialog!).getByRole("button", { name: "Go to first open instance" })
    )
    fireEvent.click(
      within(activeDialog!).getByRole("button", { name: "Go to next open instance" })
    )
    fireEvent.click(
      within(activeDialog!).getByRole("button", { name: "Go to last open instance" })
    )

    expect(callbacks.onNavigateToFirstOpenInstance).toHaveBeenCalledTimes(1)
    expect(callbacks.onNavigateToNextOpenInstance).toHaveBeenCalledTimes(1)
    expect(callbacks.onNavigateToLastOpenInstance).toHaveBeenCalledTimes(1)
  })

  it("invokes delete callback when delete is enabled", async () => {
    const entry = buildEntry()
    entry.activeItem = {
      id: "item-1",
      plan_goal_id: "goal-a",
      unit_key: "total:1",
      requirement_kind: "deadline_total",
      scheduled_date: "2026-08-31",
      original_scheduled_date: "2026-08-31",
      classification: "open",
      credit_state: "uncredited",
      locked: false,
      revision: 0,
      credited_completion_id: null,
      credited_completion_date: null,
      scheduled_time_override: null,
      effective_scheduled_local_time: null,
    }
    const callbacks = {
      onOpenChange: vi.fn(),
      onUpdateDraftLabel: vi.fn(),
      onUpdateDraftScheduledDate: vi.fn(),
      onUpdateDraftScheduledTimeOverride: vi.fn(),
      onToggleItemLock: vi.fn(),
      onRequestDeleteInstance: vi.fn(),
      onNavigateToFirstOpenInstance: vi.fn(),
      onNavigateToPreviousOpenInstance: vi.fn(),
      onNavigateToNextOpenInstance: vi.fn(),
      onNavigateToLastOpenInstance: vi.fn(),
    }

    render(
      <PlannerEventDetailDialog
        selectedEventEntry={entry}
        selectedEventLinkedTargets={[]}
        goalTitles={{}}
        scopeMonth="2026-08"
        selectedEventDraftEdit={undefined}
        selectedEventBaselineUnit={null}
        selectedEventDraftScheduledDate="2026-08-31"
        selectedEventDraftTimeInputValue=""
        mutationLoadingKey={null}
        canMutatePlanItems
        canDeleteSelectedInstance
        deleteBlockedReason={null}
        canNavigateToFirstOpenInstance={false}
        canNavigateToPreviousOpenInstance={false}
        canNavigateToNextOpenInstance={false}
        canNavigateToLastOpenInstance={false}
        getEntryGoalFirstTitleWithTime={() => "Goal A"}
        callbacks={callbacks}
      />
    )

    const activeDialog = (await screen.findAllByRole("dialog")).at(-1)
    expect(activeDialog).toBeDefined()
    fireEvent.click(within(activeDialog!).getByRole("button", { name: "Delete" }))
    expect(callbacks.onRequestDeleteInstance).toHaveBeenCalledWith(entry)
  })
})
