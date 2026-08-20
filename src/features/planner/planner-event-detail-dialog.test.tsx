import { render, screen } from "@testing-library/react"
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
})
