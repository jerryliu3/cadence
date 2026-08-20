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
        canNavigateToFirstOpenInstance={false}
        canNavigateToPreviousOpenInstance={false}
        canNavigateToNextOpenInstance={false}
        canNavigateToLastOpenInstance={false}
        getEntryDisplayTitleWithTime={() => "Goal A"}
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
        canNavigateToFirstOpenInstance
        canNavigateToPreviousOpenInstance={false}
        canNavigateToNextOpenInstance
        canNavigateToLastOpenInstance
        getEntryDisplayTitleWithTime={() => "Goal A"}
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
})
