import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarDayPreviewList } from "./calendar-day-preview-list";

describe("CalendarDayPreviewList", () => {
  it("keeps same-day completion markers to one line", () => {
    render(
      <CalendarDayPreviewList
        day="2026-08-15"
        entries={[]}
        completionFactMarkers={[
          {
            key: "completion-1",
            goalTitle: "Read",
            scheduledDate: "2026-08-15",
          },
        ]}
        mutationLoading={false}
        getEntryDisplayTitle={() => ""}
        getEntrySubtitle={() => null}
        isEntryCredited={() => false}
        isEntryImmovableForDraft={() => true}
        getCompletionToggleState={() => ({
          currentlyCredited: false,
          disabledReasonCopy: null,
        })}
        onEntryOpen={vi.fn()}
        onToggleCompletion={vi.fn()}
        onEntryPointerStart={vi.fn()}
        onEntryPointerEnd={vi.fn()}
      />
    );

    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.queryByText("Marked done.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Read")).toBeInTheDocument();
  });
});
