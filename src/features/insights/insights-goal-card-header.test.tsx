import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { InsightsGoalCardHeader } from "./insights-goal-card-header";

describe("InsightsGoalCardHeader", () => {
  it("keeps the title line compact and renders badges on a separate row", () => {
    render(
      <InsightsGoalCardHeader
        title="Run a marathon"
        color="#2563eb"
        categoryLabel="Health"
        categoryClassName="category-health"
        endDate="2026-10-31"
        action={<Button>Edit</Button>}
      />
    );

    const header = screen.getByTestId("insights-goal-card-header");
    const titleLine = within(header).getByTestId(
      "insights-goal-card-title-line"
    );
    const metaLine = within(header).getByTestId(
      "insights-goal-card-meta-line"
    );
    expect(within(titleLine).getByText("Run a marathon")).toBeInTheDocument();
    expect(within(metaLine).getByText("Health")).toBeInTheDocument();
    expect(
      within(metaLine).getByLabelText("Goal end date Oct 31, 2026")
    ).toBeInTheDocument();
    expect(
      within(header).getByRole("button", { name: "Edit" })
    ).toBeInTheDocument();
  });
});
