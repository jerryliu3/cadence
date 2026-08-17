import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BulkGoalDraftReview,
  type BulkGoalDraftReviewProps,
} from "@/features/goals/bulk-goal-draft-review";
import {
  type BulkGoalDraft,
  buildBulkGoalDraftsFromLlmGoals,
} from "@/features/goals/bulk-goal-drafts";

afterEach(cleanup);

function ReviewHarness(
  props: Omit<BulkGoalDraftReviewProps, "drafts" | "setDrafts"> & {
    initialDrafts?: BulkGoalDraft[];
  }
) {
  const [drafts, setDrafts] = useState(
    props.initialDrafts ??
      buildBulkGoalDraftsFromLlmGoals([
        {
          title: "Easy run",
          category: "Health",
          frequency_type: "recurring",
          recurrence_interval: "weekly",
          start_date: "2026-08-17",
          end_date: "2026-09-13",
        },
      ])
  );
  return (
    <BulkGoalDraftReview
      {...props}
      drafts={drafts}
      setDrafts={setDrafts}
    />
  );
}

describe("BulkGoalDraftReview", () => {
  it("edits core fields without showing full-only controls", async () => {
    const user = userEvent.setup();
    render(
      <ReviewHarness
        variant="coach"
        saving={false}
        onCreate={vi.fn()}
      />
    );

    await user.click(screen.getByText("Easy run"));
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Long run");

    expect(screen.getByDisplayValue("Long run")).toBeInTheDocument();
    expect(screen.queryByText("Photo")).not.toBeInTheDocument();
    expect(screen.queryByText("Advanced settings (optional)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
  });

  it("keeps full advanced controls for the existing bulk surface", async () => {
    const user = userEvent.setup();
    render(
      <ReviewHarness
        variant="full"
        saving={false}
        onCreate={vi.fn()}
      />
    );

    await user.click(screen.getByText("Easy run"));
    await user.click(screen.getByText("Advanced settings (optional)"));

    expect(screen.getByText("Photo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
  });

  it("shows drafts but blocks creation for an external guard", () => {
    render(
      <ReviewHarness
        variant="coach"
        saving={false}
        onCreate={vi.fn()}
        createDisabledMessage="Save or discard calendar edits first."
      />
    );

    expect(screen.getByText("Easy run")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create selected goals" })
    ).toBeDisabled();
    expect(
      screen.getByText("Save or discard calendar edits first.")
    ).toBeInTheDocument();
  });
});
